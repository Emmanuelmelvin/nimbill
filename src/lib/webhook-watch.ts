import "server-only";
import { and, eq, gt, inArray, isNotNull, lte, notExists, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { reconcileMerchant, scanNimPaymentIssues } from "./invoices";
import { logger } from "./logger";
import { WATCH_AFTER_LOCK_MIN } from "./webhook-policy";
import { recordInvoiceExpired } from "./webhooks";

// Payments to store invoices are noticed even when nobody is looking.
//
// The web app only checks the chain when someone asks: the payer's page polls, or the merchant
// opens their dashboard. A shopper who pays and closes the tab would leave a store waiting. The
// worker therefore looks for these payments itself, with the same matching rules (reconcileMerchant
// -> markPaid, which also queues the webhook).
//
// Only invoices with a recent price lock are watched: a payment only counts within a lock (plus its
// grace period), so an invoice with no recent lock can't become paid and is left alone. That keeps
// the work small however many invoices exist. The same window is used to spot NIM that carried an
// invoice's memo but didn't pay it (invoice.payment_issue), and expiry waits for it to close.

/** How long after a price lock ends a payment can still show up (grace + time to confirm). */
const WATCH_AFTER_LOCK_MS = WATCH_AFTER_LOCK_MIN * 60_000;

function byMerchant(rows: { merchant: string; id: string }[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of rows) m.set(r.merchant, [...(m.get(r.merchant) ?? []), r.id]);
  return m;
}

/**
 * Check the chain for every store invoice with a recent price lock: mark the ones that got paid,
 * and report NIM payments that carried an invoice's memo but didn't pay it. Returns how many got paid.
 */
export async function watchStoreInvoices(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ merchant: schema.invoices.merchantAddress, id: schema.invoices.id, status: schema.invoices.status })
    .from(schema.invoices)
    .innerJoin(schema.quotes, eq(schema.quotes.invoiceId, schema.invoices.id))
    .where(
      and(
        isNotNull(schema.invoices.integrationId),
        eq(schema.invoices.isDemo, false),
        gt(schema.quotes.expiresAt, new Date(Date.now() - WATCH_AFTER_LOCK_MS)),
      ),
    );
  if (!rows.length) return 0;

  let paid = 0;
  for (const [merchant, ids] of byMerchant(rows.filter((r) => r.status === "unpaid"))) {
    try {
      paid += await reconcileMerchant(merchant, ids);
    } catch (e) {
      // One merchant's RPC trouble shouldn't stop the others; the next round tries again.
      logger.warn("watch: reconcile failed", { invoices: ids.length, error: (e as Error).message });
    }
  }
  if (paid) logger.info("watch: payments found", { paid });

  // After reconciling, so a payment that settles its invoice is already marked paid, not reported.
  // Paid invoices are included: a second payment for one is an issue the store should hear about.
  for (const [merchant, ids] of byMerchant(rows)) {
    try {
      await scanNimPaymentIssues(merchant, ids);
    } catch (e) {
      logger.warn("watch: payment issue scan failed", { invoices: ids.length, error: (e as Error).message });
    }
  }
  return paid;
}

/**
 * Mark store invoices "expired" once they are past `expiresAt` and no price lock can still be paid
 * (every lock ended more than WATCH_AFTER_LOCK_MIN ago, so the watch above has had its full window),
 * and queue invoice.expired. A last look at the chain comes first. The update only matches unpaid
 * invoices, like markPaid, so an invoice ends up either paid or expired, never both.
 */
export async function expireStoreInvoices(limit = 100): Promise<number> {
  const db = await getDb();
  const now = new Date();
  const lockCutoff = new Date(now.getTime() - WATCH_AFTER_LOCK_MS);
  const due = await db
    .select({ merchant: schema.invoices.merchantAddress, id: schema.invoices.id })
    .from(schema.invoices)
    .where(
      and(
        eq(schema.invoices.status, "unpaid"),
        isNotNull(schema.invoices.integrationId),
        isNotNull(schema.invoices.expiresAt),
        lte(schema.invoices.expiresAt, now),
        notExists(
          db
            .select({ one: sql`1` })
            .from(schema.quotes)
            .where(and(eq(schema.quotes.invoiceId, schema.invoices.id), gt(schema.quotes.expiresAt, lockCutoff))),
        ),
      ),
    )
    .limit(limit);
  if (!due.length) return 0;

  // Only invoices that ever had a price lock can have been paid; check those one last time.
  const locked = new Set(
    (
      await db
        .selectDistinct({ id: schema.quotes.invoiceId })
        .from(schema.quotes)
        .where(
          inArray(
            schema.quotes.invoiceId,
            due.map((d) => d.id),
          ),
        )
    ).map((r) => r.id),
  );
  // If the chain can't be read, those invoices wait for the next round: an RPC outage must never
  // expire an invoice that was actually paid.
  const unchecked = new Set<string>();
  for (const [merchant, ids] of byMerchant(due.filter((d) => locked.has(d.id)))) {
    try {
      await reconcileMerchant(merchant, ids, { strict: true });
    } catch (e) {
      ids.forEach((id) => unchecked.add(id));
      logger.warn("expire: last check failed, trying again later", { invoices: ids.length, error: (e as Error).message });
    }
  }
  const ready = due.map((d) => d.id).filter((id) => !unchecked.has(id));
  if (!ready.length) return 0;

  const expired = await db
    .update(schema.invoices)
    .set({ status: "expired" })
    .where(and(inArray(schema.invoices.id, ready), eq(schema.invoices.status, "unpaid")))
    .returning();
  for (const inv of expired) await recordInvoiceExpired(inv);
  if (expired.length) logger.info("expire: store invoices expired", { expired: expired.length });
  return expired.length;
}
