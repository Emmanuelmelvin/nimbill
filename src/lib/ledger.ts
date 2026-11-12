import "server-only";
import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";
import { LUNA_PER_NIM, USDT_DECIMALS } from "./currencies";
import { getDb, schema } from "./db";
import type { Goal, Invoice } from "./db/schema";
import type { EarningPoint } from "./earnings";
import { Errors } from "./errors";
import { newId } from "./invoices";
import { logger } from "./logger";
import { toUsd, type Fx } from "./money";
import { tryGetFx } from "./rates";

// What a merchant earned, is owed, and is aiming for. Read-only views over invoices, plus goals.

const coins = (inv: Pick<Invoice, "paidAsset" | "paidAmount">) =>
  Number(inv.paidAmount ?? 0) / (inv.paidAsset === "NIM" ? LUNA_PER_NIM : 10 ** USDT_DECIMALS);

/**
 * Paid invoices from before `paid_usd` existed (or verified while prices were down) get a dollar
 * value here: the invoice total converted at today's fiat rate. For non-USD invoices that is an
 * approximation of what the payment was worth on the day, which is why new payments store the
 * real value when they are verified.
 */
async function backfillPaidUsd(merchantAddress: string, fx: Fx): Promise<void> {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.invoices.id, total: schema.invoices.total, tip: schema.invoices.paidTip, currency: schema.invoices.currency })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.merchantAddress, merchantAddress), eq(schema.invoices.status, "paid"), isNull(schema.invoices.paidUsd)));
  for (const r of rows) {
    const usd = toUsd(Number(r.total) + Number(r.tip ?? 0), r.currency, fx); // a tip is part of what was received
    if (usd === null) continue;
    await db
      .update(schema.invoices)
      .set({ paidUsd: usd.toFixed(6) })
      .where(and(eq(schema.invoices.id, r.id), isNull(schema.invoices.paidUsd)));
  }
  if (rows.length) logger.info("backfilled paid_usd", { merchantAddress, count: rows.length });
}

/** Dollar value of an invoice: what was received if paid, else its total at today's rate. Null without a rate. */
export function invoiceUsd(inv: Invoice, fx: Fx | null): number | null {
  if (inv.status === "paid") {
    if (inv.paidUsd) return Number(inv.paidUsd);
    // Not backfilled yet (prices unavailable). USDT is its own dollar value; NIM has to wait.
    if (inv.paidAsset === "USDT") return coins(inv);
  }
  return toUsd(Number(inv.total), inv.currency, fx);
}

/** Rates plus the currency totals are shown in; fills in missing dollar values on the way. */
export async function prepareLedger(merchantAddress: string): Promise<{ fx: Fx | null; currency: string }> {
  const db = await getDb();
  const fx = await tryGetFx();
  if (fx) await backfillPaidUsd(merchantAddress, fx);
  const [merchant] = await db
    .select({ displayCurrency: schema.merchants.displayCurrency })
    .from(schema.merchants)
    .where(eq(schema.merchants.address, merchantAddress));
  let currency = merchant?.displayCurrency ?? null;
  if (!currency) {
    // No preference saved: follow the currency of the latest invoice.
    const [latest] = await db
      .select({ currency: schema.invoices.currency })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.merchantAddress, merchantAddress), eq(schema.invoices.isDemo, false)))
      .orderBy(desc(schema.invoices.createdAt))
      .limit(1);
    currency = latest?.currency ?? "USD";
  }
  return { fx, currency };
}

export type OpenInvoice = { usd: number | null; dueDate: string | null };

/** Every payment received and every invoice still awaiting payment. */
export async function getEarnings(merchantAddress: string, fx: Fx | null): Promise<{ points: EarningPoint[]; open: OpenInvoice[] }> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.merchantAddress, merchantAddress), eq(schema.invoices.isDemo, false)))
    .orderBy(asc(schema.invoices.createdAt));
  const points: EarningPoint[] = [];
  const open: OpenInvoice[] = [];
  for (const inv of rows) {
    if (inv.status === "paid" && inv.paidAt && inv.paidAsset) {
      points.push({
        at: inv.paidAt.toISOString(),
        usd: invoiceUsd(inv, fx) ?? 0,
        asset: inv.paidAsset,
        amount: inv.paidAmount ?? "0",
        client: inv.clientName,
      });
    } else if (inv.status === "unpaid") {
      open.push({ usd: invoiceUsd(inv, fx), dueDate: inv.dueDate });
    }
  }
  points.sort((a, b) => a.at.localeCompare(b.at));
  return { points, open };
}

/** Paid invoices for the accountant, oldest first. `sinceDays` limits it to recent payments. */
export async function listPaidInvoices(merchantAddress: string, sinceDays?: number): Promise<Invoice[]> {
  const db = await getDb();
  const conds = [
    eq(schema.invoices.merchantAddress, merchantAddress),
    eq(schema.invoices.isDemo, false),
    eq(schema.invoices.status, "paid"),
  ];
  if (sinceDays) conds.push(gte(schema.invoices.paidAt, new Date(Date.now() - sinceDays * 86_400_000)));
  return db
    .select()
    .from(schema.invoices)
    .where(and(...conds))
    .orderBy(asc(schema.invoices.paidAt));
}

// ---------- goals ----------

export type GoalInput = { title: string; targetAmount: number; currency: string; startDate: string; endDate: string };

export function publicGoal(g: Goal) {
  return { id: g.id, title: g.title, targetAmount: g.targetAmount, currency: g.currency, startDate: g.startDate, endDate: g.endDate };
}
export type PublicGoal = ReturnType<typeof publicGoal>;

/** Newest period first. */
export async function listGoals(merchantAddress: string): Promise<Goal[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.goals)
    .where(eq(schema.goals.merchantAddress, merchantAddress))
    .orderBy(desc(schema.goals.endDate), desc(schema.goals.createdAt))
    .limit(50);
}

/**
 * One goal at a time: a goal that has not ended yet blocks a second one. `today` is the
 * merchant's local date, so "ended" means the same thing here as on their screen.
 */
async function assertNoOtherCurrentGoal(merchantAddress: string, today: string, exceptId?: string) {
  const current = (await listGoals(merchantAddress)).find((g) => g.endDate >= today && g.id !== exceptId);
  if (current) throw Errors.conflict(`You already have a goal running ("${current.title}"). Finish or delete it first.`);
}

export async function createGoal(merchantAddress: string, input: GoalInput, today: string): Promise<Goal> {
  if (input.endDate < today) throw Errors.validation("The end date is already in the past.");
  await assertNoOtherCurrentGoal(merchantAddress, today);
  const db = await getDb();
  const [goal] = await db
    .insert(schema.goals)
    .values({ id: newId(), merchantAddress, ...input, targetAmount: String(input.targetAmount) })
    .returning();
  return goal;
}

export async function updateGoal(merchantAddress: string, id: string, input: GoalInput, today: string): Promise<Goal> {
  if (input.endDate >= today) await assertNoOtherCurrentGoal(merchantAddress, today, id);
  const db = await getDb();
  const [goal] = await db
    .update(schema.goals)
    .set({ ...input, targetAmount: String(input.targetAmount) })
    .where(and(eq(schema.goals.id, id), eq(schema.goals.merchantAddress, merchantAddress)))
    .returning();
  if (!goal) throw Errors.notFound("Goal not found.");
  return goal;
}

export async function deleteGoal(merchantAddress: string, id: string): Promise<void> {
  const db = await getDb();
  const rows = await db
    .delete(schema.goals)
    .where(and(eq(schema.goals.id, id), eq(schema.goals.merchantAddress, merchantAddress)))
    .returning({ id: schema.goals.id });
  if (!rows.length) throw Errors.notFound("Goal not found.");
}
