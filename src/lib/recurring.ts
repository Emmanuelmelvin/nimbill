import "server-only";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { and, asc, desc, eq, lte, ne, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Invoice, LineItem, RecurringInterval, RecurringInvoice, RecurringStatus } from "./db/schema";
import { env } from "./env";
import { Errors } from "./errors";
import { computeTotal, createInvoice, newId } from "./invoices";
import { notifyRecurringInvoiceIssued, notifyRecurringUnsubscribed } from "./notifications";
import { logger } from "./logger";
import { metrics } from "./observability";

function unsubscribeKey(): Uint8Array {
  return utf8ToBytes(env.SESSION_SECRET || "nimbill-dev-recurring-unsubscribe-secret");
}

/** Deterministic 32-hex-char HMAC token authorizing the client to unsubscribe from `recurringId`. */
export function recurringUnsubscribeToken(recurringId: string): string {
  return bytesToHex(hmac(sha256, unsubscribeKey(), utf8ToBytes(`recurring-unsubscribe:${recurringId}`))).slice(0, 32);
}

export function verifyUnsubscribeToken(recurringId: string, token: string): boolean {
  const expected = recurringUnsubscribeToken(recurringId);
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export function recurringUnsubscribePath(recurringId: string): string {
  return `/r/${recurringId}/unsubscribe?token=${recurringUnsubscribeToken(recurringId)}`;
}

/** Today's YYYY-MM-DD in UTC. */
export function todayDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function parseIsoDate(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

function formatIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Add `days` to a YYYY-MM-DD date string. */
export function addDaysToDate(dateStr: string, days: number): string {
  const { y, m, d } = parseIsoDate(dateStr);
  return formatIsoDate(new Date(Date.UTC(y, m - 1, d + days)));
}

/** Day of the month (1-31) of a YYYY-MM-DD date. */
export function dayOfMonth(dateStr: string): number {
  return parseIsoDate(dateStr).d;
}

/**
 * Advance a YYYY-MM-DD date by one `interval`. Month-based intervals land on `anchorDay` (the
 * schedule's day of the month, default: the day of `dateStr`), clamped to the last day of short
 * months: with anchor 31, 2026-01-31 → 02-28 → 03-31 → 04-30, never drifting to the 28th for good.
 */
export function addInterval(dateStr: string, interval: RecurringInterval, anchorDay?: number | null): string {
  const { y, m, d } = parseIsoDate(dateStr);
  if (interval === "weekly") return addDaysToDate(dateStr, 7);
  if (interval === "biweekly") return addDaysToDate(dateStr, 14);
  const monthsToAdd = interval === "monthly" ? 1 : interval === "quarterly" ? 3 : 12;
  const targetMonthIndex = m - 1 + monthsToAdd;
  const targetYear = y + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = anchorDay && anchorDay >= 1 && anchorDay <= 31 ? anchorDay : d;
  return formatIsoDate(new Date(Date.UTC(targetYear, targetMonth, Math.min(day, daysInTargetMonth))));
}

/** Advance `dateStr` by `interval` (on `anchorDay`) until it is strictly after `afterDate`. */
export function nextFutureDate(dateStr: string, interval: RecurringInterval, afterDate: string, anchorDay?: number | null): string {
  let next = addInterval(dateStr, interval, anchorDay);
  let guard = 0;
  while (next <= afterDate && guard++ < 500) {
    next = addInterval(next, interval, anchorDay);
  }
  return next;
}

export async function createRecurringInvoice(input: {
  merchantAddress: string;
  merchantName: string;
  merchantEvmAddress?: string | null;
  clientName: string;
  clientEmail?: string | null;
  items: LineItem[];
  currency: string;
  note?: string | null;
  interval: RecurringInterval;
  dueDays: number;
  startDate?: string | null;
}): Promise<{ recurring: RecurringInvoice; invoice: Invoice | null }> {
  const db = await getDb();
  const today = todayDate();
  const start = input.startDate && input.startDate >= today ? input.startDate : today;
  const issueImmediately = start <= today;
  const id = `rec_${newId(10)}`;
  const anchorDay = dayOfMonth(start);
  const nextRunDate = issueImmediately ? addInterval(start, input.interval, anchorDay) : start;

  let firstInvoice: Invoice | null = null;
  if (issueImmediately) {
    firstInvoice = await createInvoice({
      merchantAddress: input.merchantAddress,
      merchantName: input.merchantName,
      merchantEvmAddress: input.merchantEvmAddress ?? null,
      clientName: input.clientName,
      clientEmail: input.clientEmail || null,
      items: input.items,
      currency: input.currency,
      note: input.note || null,
      dueDate: addDaysToDate(today, input.dueDays),
      recurringId: id,
    });
    metrics.invoiceCreated(firstInvoice.currency);
  }

  const [rec] = await db
    .insert(schema.recurringInvoices)
    .values({
      id,
      merchantAddress: input.merchantAddress,
      merchantName: input.merchantName,
      merchantEvmAddress: input.merchantEvmAddress ?? null,
      clientName: input.clientName,
      clientEmail: input.clientEmail || null,
      items: input.items,
      currency: input.currency,
      total: computeTotal(input.items).toFixed(2),
      note: input.note || null,
      interval: input.interval,
      dueDays: input.dueDays,
      nextRunDate,
      anchorDay,
      lastRunDate: issueImmediately ? today : null,
      lastInvoiceId: firstInvoice?.id ?? null,
      generatedCount: issueImmediately ? 1 : 0,
      status: "active",
    })
    .returning();

  if (firstInvoice) {
    // The merchant just created this schedule in the UI, so only email the client on the immediate
    // first cycle; later background cycles email both the client and the merchant.
    notifyRecurringInvoiceIssued(firstInvoice, rec, { notifyMerchant: false });
  }

  return { recurring: rec, invoice: firstInvoice };
}

export async function listRecurringInvoices(merchantAddress: string): Promise<RecurringInvoice[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.recurringInvoices)
    .where(eq(schema.recurringInvoices.merchantAddress, merchantAddress))
    .orderBy(desc(schema.recurringInvoices.createdAt))
    .limit(100);
}

export async function getRecurringInvoice(id: string): Promise<RecurringInvoice | null> {
  const db = await getDb();
  const [rec] = await db.select().from(schema.recurringInvoices).where(eq(schema.recurringInvoices.id, id));
  return rec ?? null;
}

/**
 * Spawn one invoice for `rec` using the merchant's latest profile (name and Polygon wallet).
 */
async function spawnInvoiceForSchedule(rec: RecurringInvoice, issueDate: string): Promise<Invoice> {
  const db = await getDb();
  const [merchant] = await db.select().from(schema.merchants).where(eq(schema.merchants.address, rec.merchantAddress));
  const inv = await createInvoice({
    merchantAddress: rec.merchantAddress,
    merchantName: merchant?.name || rec.merchantName,
    merchantEvmAddress: merchant ? merchant.evmAddress : rec.merchantEvmAddress,
    clientName: rec.clientName,
    clientEmail: rec.clientEmail,
    items: rec.items,
    currency: rec.currency,
    note: rec.note,
    dueDate: addDaysToDate(issueDate, rec.dueDays),
    recurringId: rec.id,
  });
  metrics.invoiceCreated(inv.currency);
  return inv;
}

/**
 * Give a claimed cycle back after its invoice could not be created, so the next run retries it
 * instead of silently skipping a billing period. Only applies while nobody has moved the schedule
 * since our claim. (The Neon HTTP driver has no interactive transactions, hence this compensation.)
 */
async function releaseClaim(rec: RecurringInvoice, claimedNextRunDate: string): Promise<void> {
  const db = await getDb();
  try {
    await db
      .update(schema.recurringInvoices)
      .set({ nextRunDate: rec.nextRunDate, lastRunDate: rec.lastRunDate, updatedAt: new Date() })
      .where(and(eq(schema.recurringInvoices.id, rec.id), eq(schema.recurringInvoices.nextRunDate, claimedNextRunDate)));
  } catch (e) {
    logger.error("recurring claim release failed: this cycle was skipped", {
      recurringId: rec.id,
      cycle: rec.nextRunDate,
      error: (e as Error).message,
    });
  }
}

/**
 * Find active recurring schedules whose `nextRunDate <= today`, claim each one atomically, and
 * generate its next invoice. Safe to call from both the background worker and GET /api/invoices.
 *
 * Catch-up is deliberate: if several cycles were missed (the worker was down), one invoice is
 * issued, dated today, and the schedule jumps to its next future date. Clients never get a burst of
 * back-dated invoices. A schedule whose invoice fails to generate is retried on the next run and
 * never stops the others.
 */
export async function advanceDueRecurring(merchantAddress?: string): Promise<number> {
  const db = await getDb();
  const today = todayDate();
  const conds = [eq(schema.recurringInvoices.status, "active"), lte(schema.recurringInvoices.nextRunDate, today)];
  if (merchantAddress) conds.push(eq(schema.recurringInvoices.merchantAddress, merchantAddress));

  const due = await db
    .select()
    .from(schema.recurringInvoices)
    .where(and(...conds))
    .orderBy(asc(schema.recurringInvoices.nextRunDate))
    .limit(50);

  let issued = 0;
  for (const rec of due) {
    const nextRunDate = nextFutureDate(rec.nextRunDate, rec.interval, today, rec.anchorDay);
    // Claim the cycle first by advancing nextRunDate conditionally, so concurrent workers/requests
    // never generate two invoices for the same cycle.
    const [claimed] = await db
      .update(schema.recurringInvoices)
      .set({
        nextRunDate,
        lastRunDate: today,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.recurringInvoices.id, rec.id),
          eq(schema.recurringInvoices.status, "active"),
          eq(schema.recurringInvoices.nextRunDate, rec.nextRunDate),
        ),
      )
      .returning();
    if (!claimed) continue;

    let inv: Invoice;
    try {
      inv = await spawnInvoiceForSchedule(claimed, today);
    } catch (e) {
      logger.error("recurring invoice generation failed; will retry next run", {
        recurringId: rec.id,
        cycle: rec.nextRunDate,
        error: (e as Error).message,
      });
      await releaseClaim(rec, nextRunDate);
      continue;
    }
    const [updated] = await db
      .update(schema.recurringInvoices)
      .set({
        lastInvoiceId: inv.id,
        generatedCount: sql`${schema.recurringInvoices.generatedCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.recurringInvoices.id, rec.id))
      .returning();

    notifyRecurringInvoiceIssued(inv, updated ?? claimed, { notifyMerchant: true });
    issued += 1;
  }
  return issued;
}

/**
 * Pause, resume, cancel, or immediately issue the next invoice for a recurring schedule.
 */
export async function updateRecurringSchedule(
  id: string,
  merchantAddress: string,
  action: "pause" | "resume" | "cancel" | "issue_now",
): Promise<{ recurring: RecurringInvoice; invoice?: Invoice }> {
  const db = await getDb();
  const [rec] = await db
    .select()
    .from(schema.recurringInvoices)
    .where(and(eq(schema.recurringInvoices.id, id), eq(schema.recurringInvoices.merchantAddress, merchantAddress)));
  if (!rec) throw Errors.notFound("Recurring schedule not found.");
  if (rec.status === "cancelled") throw Errors.badRequest("This recurring schedule was cancelled.");

  const today = todayDate();

  if (action === "issue_now") {
    // "Issue now" bills the upcoming cycle early: the schedule then moves one interval past it, so
    // the client is never billed twice for one period. If that cycle is already due, it is the one
    // the worker would have issued, and the schedule jumps to its next future date.
    const nextRunDate =
      rec.nextRunDate <= today
        ? nextFutureDate(rec.nextRunDate, rec.interval, today, rec.anchorDay)
        : addInterval(rec.nextRunDate, rec.interval, rec.anchorDay);
    // Claim the cycle exactly like the worker does, so a concurrent run can't issue it too.
    const [claimed] = await db
      .update(schema.recurringInvoices)
      .set({ nextRunDate, lastRunDate: today, updatedAt: new Date() })
      .where(
        and(
          eq(schema.recurringInvoices.id, rec.id),
          ne(schema.recurringInvoices.status, "cancelled"),
          eq(schema.recurringInvoices.nextRunDate, rec.nextRunDate),
        ),
      )
      .returning();
    if (!claimed) throw Errors.conflict("This schedule just changed. Refresh and try again.");

    let inv: Invoice;
    try {
      inv = await spawnInvoiceForSchedule(claimed, today);
    } catch (e) {
      await releaseClaim(rec, nextRunDate);
      throw e;
    }
    const [updated] = await db
      .update(schema.recurringInvoices)
      .set({
        lastInvoiceId: inv.id,
        generatedCount: sql`${schema.recurringInvoices.generatedCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.recurringInvoices.id, rec.id))
      .returning();
    notifyRecurringInvoiceIssued(inv, updated ?? claimed, { notifyMerchant: false });
    return { recurring: updated ?? claimed, invoice: inv };
  }

  const nextStatus: RecurringStatus = action === "pause" ? "paused" : action === "resume" ? "active" : "cancelled";
  // Resuming keeps the schedule on its own dates (and day of the month); a cycle that fell due
  // while paused is skipped, not billed late.
  const nextRunDate =
    action === "resume" && rec.nextRunDate <= today ? nextFutureDate(rec.nextRunDate, rec.interval, today, rec.anchorDay) : rec.nextRunDate;

  const [updated] = await db
    .update(schema.recurringInvoices)
    .set({
      status: nextStatus,
      cancelledBy: action === "cancel" ? "merchant" : null,
      nextRunDate,
      updatedAt: new Date(),
    })
    .where(eq(schema.recurringInvoices.id, rec.id))
    .returning();
  return { recurring: updated };
}

/**
 * Called when the client clicks "Unsubscribe / Stop future invoices" from their email or invoice page.
 * Leaves any already-issued invoice untouched and stops future cycles.
 */
export async function unsubscribeRecurringSchedule(
  id: string,
  token: string,
): Promise<{ recurring: RecurringInvoice; alreadyCancelled: boolean }> {
  if (!verifyUnsubscribeToken(id, token)) {
    throw Errors.forbidden("This unsubscribe link is invalid.");
  }
  const db = await getDb();
  const [rec] = await db.select().from(schema.recurringInvoices).where(eq(schema.recurringInvoices.id, id));
  if (!rec) throw Errors.notFound("Recurring schedule not found.");
  if (rec.status === "cancelled") {
    return { recurring: rec, alreadyCancelled: true };
  }
  const [updated] = await db
    .update(schema.recurringInvoices)
    .set({
      status: "cancelled",
      cancelledBy: "client",
      updatedAt: new Date(),
    })
    // Only the first of two simultaneous clicks cancels (and emails the merchant).
    .where(and(eq(schema.recurringInvoices.id, rec.id), ne(schema.recurringInvoices.status, "cancelled")))
    .returning();
  if (!updated) {
    const current = await getRecurringInvoice(id);
    return { recurring: current ?? rec, alreadyCancelled: true };
  }
  notifyRecurringUnsubscribed(updated);
  return { recurring: updated, alreadyCancelled: false };
}

export function publicRecurringInvoice(rec: RecurringInvoice) {
  return {
    id: rec.id,
    merchantAddress: rec.merchantAddress,
    merchantName: rec.merchantName,
    clientName: rec.clientName,
    clientEmail: rec.clientEmail,
    items: rec.items,
    currency: rec.currency,
    total: rec.total,
    note: rec.note,
    interval: rec.interval,
    dueDays: rec.dueDays,
    nextRunDate: rec.nextRunDate,
    lastRunDate: rec.lastRunDate,
    lastInvoiceId: rec.lastInvoiceId,
    generatedCount: rec.generatedCount,
    status: rec.status,
    cancelledBy: rec.cancelledBy ?? null,
    createdAt: rec.createdAt.toISOString(),
  };
}

export type PublicRecurringInvoice = ReturnType<typeof publicRecurringInvoice>;

/** Summary attached to GET /api/invoices/[id] when an invoice belongs to a recurring schedule. */
export function invoiceRecurringSummary(rec: RecurringInvoice) {
  return {
    id: rec.id,
    interval: rec.interval,
    status: rec.status,
    cancelledBy: rec.cancelledBy ?? null,
    unsubscribePath: recurringUnsubscribePath(rec.id),
  };
}

export type InvoiceRecurringSummary = ReturnType<typeof invoiceRecurringSummary>;
