import "server-only";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { getAddress } from "viem";
import { getDb, schema } from "./db";
import type { Invoice, LineItem, Quote } from "./db/schema";
import { getRate } from "./rates";
import { LUNA_PER_NIM, USDT_DECIMALS } from "./currencies";
import {
  decodeData,
  getNimTransaction,
  getNimTransactionsByAddress,
  getUsdtTransfers,
  sameNimAddress,
  type NimTx,
} from "./chain";

export const QUOTE_TTL_MS = 5 * 60 * 1000;
// A payment broadcast just before a quote expires still counts if it lands within this window.
const QUOTE_GRACE_MS = 3 * 60 * 1000;

const ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export function newId(len = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
}

/** The text attached to a NIM payment on-chain. Max 64 bytes. */
export const paymentMemo = (invoiceId: string) => `NimBill ${invoiceId}`;

export function computeTotal(items: LineItem[]): number {
  return Math.round(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) * 100) / 100;
}

// ---------- create / read ----------

export async function ensureMerchant(address: string) {
  const db = await getDb();
  await db.insert(schema.merchants).values({ address }).onConflictDoNothing();
  const [m] = await db.select().from(schema.merchants).where(eq(schema.merchants.address, address));
  return m;
}

export async function createInvoice(input: {
  merchantAddress: string;
  merchantName: string;
  merchantEvmAddress?: string | null;
  clientName: string;
  clientEmail?: string | null;
  items: LineItem[];
  currency: string;
  note?: string | null;
  dueDate?: string | null;
  isDemo?: boolean;
}): Promise<Invoice> {
  const db = await getDb();
  await ensureMerchant(input.merchantAddress);
  const [{ invoiceCounter }] = await db
    .update(schema.merchants)
    .set({ invoiceCounter: sql`${schema.merchants.invoiceCounter} + 1` })
    .where(eq(schema.merchants.address, input.merchantAddress))
    .returning({ invoiceCounter: schema.merchants.invoiceCounter });
  const [inv] = await db
    .insert(schema.invoices)
    .values({
      id: newId(),
      number: input.isDemo ? `DEMO-${newId(4).toUpperCase()}` : `INV-${String(invoiceCounter).padStart(4, "0")}`,
      merchantAddress: input.merchantAddress,
      merchantName: input.merchantName,
      merchantEvmAddress: input.merchantEvmAddress ?? null,
      clientName: input.clientName,
      clientEmail: input.clientEmail || null,
      items: input.items,
      currency: input.currency,
      total: computeTotal(input.items).toFixed(2),
      note: input.note || null,
      dueDate: input.dueDate || null,
      isDemo: !!input.isDemo,
    })
    .returning();
  return inv;
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const db = await getDb();
  const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, id));
  return inv ?? null;
}

export async function listInvoices(merchantAddress: string): Promise<Invoice[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.merchantAddress, merchantAddress), eq(schema.invoices.isDemo, false)))
    .orderBy(desc(schema.invoices.createdAt))
    .limit(200);
}

export async function cancelInvoice(id: string, merchantAddress: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .update(schema.invoices)
    .set({ status: "cancelled" })
    .where(and(eq(schema.invoices.id, id), eq(schema.invoices.merchantAddress, merchantAddress), eq(schema.invoices.status, "unpaid")))
    .returning({ id: schema.invoices.id });
  return rows.length > 0;
}

// ---------- quotes (rate lock) ----------

export async function createQuote(inv: Invoice, asset: "NIM" | "USDT"): Promise<Quote> {
  if (inv.status !== "unpaid") throw new UserError(inv.status === "paid" ? "This invoice is already paid." : "This invoice was cancelled.");
  if (asset === "USDT" && !inv.merchantEvmAddress) throw new UserError("This merchant does not accept USDT yet.");
  const rate = await getRate(asset, inv.currency);
  const coins = Number(inv.total) / rate;
  // Round up to 0.01 of the coin so the merchant never receives less than the invoice total.
  const unit = asset === "NIM" ? LUNA_PER_NIM : 10 ** USDT_DECIMALS;
  const step = unit / 100;
  const amount = BigInt(Math.max(step, Math.ceil((coins * unit) / step) * step));
  const db = await getDb();
  const [q] = await db
    .insert(schema.quotes)
    .values({
      id: newId(12),
      invoiceId: inv.id,
      asset,
      amount: amount.toString(),
      rate: String(rate),
      expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
    })
    .returning();
  return q;
}

async function quotesFor(invoiceIds: string[]): Promise<Quote[]> {
  if (!invoiceIds.length) return [];
  const db = await getDb();
  return db.select().from(schema.quotes).where(inArray(schema.quotes.invoiceId, invoiceIds));
}

/** Smallest quote this payment satisfies: right asset, enough value, sent before the lock (plus grace) expired. */
function matchQuote(quotes: Quote[], asset: "NIM" | "USDT", value: bigint, txTime: number): Quote | null {
  const ok = quotes
    .filter((q) => q.asset === asset && value >= BigInt(q.amount))
    .filter((q) => txTime >= q.createdAt.getTime() - 60_000 && txTime <= q.expiresAt.getTime() + QUOTE_GRACE_MS);
  ok.sort((a, b) => Number(BigInt(b.amount) - BigInt(a.amount)));
  return ok[0] ?? null;
}

async function markPaid(inv: Invoice, q: Quote, txHash: string, from: string, paidAt: Date, value: bigint): Promise<Invoice | null> {
  const db = await getDb();
  try {
    const [updated] = await db
      .update(schema.invoices)
      .set({
        status: "paid",
        paidAsset: q.asset,
        paidAmount: value.toString(),
        paidRate: q.rate,
        paidTxHash: txHash.toLowerCase(),
        paidFrom: from,
        paidAt,
      })
      .where(and(eq(schema.invoices.id, inv.id), eq(schema.invoices.status, "unpaid"), isNull(schema.invoices.paidTxHash)))
      .returning();
    return updated ?? null;
  } catch {
    // unique(paid_tx_hash): this transaction already paid another invoice
    return null;
  }
}

export class UserError extends Error {}

export type VerifyResult =
  | { status: "paid"; invoice: Invoice }
  | { status: "pending"; message: string }
  | { status: "rejected"; message: string };

function nimTxMatches(inv: Invoice, tx: NimTx): boolean {
  return (
    tx.executionResult &&
    sameNimAddress(tx.to, inv.merchantAddress) &&
    decodeData(tx.recipientData).trim() === paymentMemo(inv.id)
  );
}

/** Verify a specific transaction hash the payer's wallet returned. */
export async function verifyPayment(inv: Invoice, asset: "NIM" | "USDT", txHash: string): Promise<VerifyResult> {
  if (inv.status === "paid") return { status: "paid", invoice: inv };
  if (inv.status === "cancelled") return { status: "rejected", message: "This invoice was cancelled." };
  const quotes = await quotesFor([inv.id]);

  if (asset === "NIM") {
    if (!/^[0-9a-f]{64}$/i.test(txHash)) return { status: "rejected", message: "Invalid transaction hash." };
    const tx = await getNimTransaction(txHash.toLowerCase());
    if (!tx) return { status: "pending", message: "Waiting for the transaction to be included in a block…" };
    if (!tx.executionResult) return { status: "rejected", message: "The transaction failed on-chain." };
    if (!nimTxMatches(inv, tx)) return { status: "rejected", message: "This transaction does not pay this invoice." };
    const q = matchQuote(quotes, "NIM", BigInt(tx.value), tx.timestamp);
    if (!q) return { status: "rejected", message: "The amount paid is lower than the locked price, or the price lock expired." };
    const updated = await markPaid(inv, q, tx.hash, tx.from, new Date(tx.timestamp), BigInt(tx.value));
    if (updated) return { status: "paid", invoice: updated };
    const fresh = await getInvoice(inv.id);
    return fresh?.status === "paid" ? { status: "paid", invoice: fresh } : { status: "rejected", message: "This transaction was already used." };
  }

  if (!/^0x[0-9a-f]{64}$/i.test(txHash)) return { status: "rejected", message: "Invalid transaction hash." };
  if (!inv.merchantEvmAddress) return { status: "rejected", message: "This merchant does not accept USDT." };
  const transfers = await getUsdtTransfers(txHash);
  if (!transfers) return { status: "pending", message: "Waiting for Polygon to confirm the transaction…" };
  const merchant = getAddress(inv.merchantEvmAddress);
  const t = transfers.find((x) => getAddress(x.to) === merchant);
  if (!t) return { status: "rejected", message: "This transaction does not send USDT to the merchant." };
  if (!t.confirmed) return { status: "pending", message: "Confirming on Polygon…" };
  const q = matchQuote(quotes, "USDT", t.value, t.timestamp);
  if (!q) return { status: "rejected", message: "The amount paid is lower than the locked price, or the price lock expired." };
  const updated = await markPaid(inv, q, txHash, t.from, new Date(t.timestamp), t.value);
  if (updated) return { status: "paid", invoice: updated };
  const fresh = await getInvoice(inv.id);
  return fresh?.status === "paid" ? { status: "paid", invoice: fresh } : { status: "rejected", message: "This transaction was already used." };
}

/**
 * Find NIM payments for unpaid invoices by scanning the merchant's recent transactions
 * for the invoice memo. Recovers payments where the payer closed the app before we
 * saw the hash, or paid from another Nimiq wallet via the payment link / QR.
 */
export async function reconcileMerchant(merchantAddress: string, onlyInvoiceIds?: string[]): Promise<number> {
  const db = await getDb();
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const conds = [
    eq(schema.invoices.merchantAddress, merchantAddress),
    eq(schema.invoices.status, "unpaid"),
    gt(schema.invoices.createdAt, since),
  ];
  if (onlyInvoiceIds?.length) conds.push(inArray(schema.invoices.id, onlyInvoiceIds));
  const unpaid = await db.select().from(schema.invoices).where(and(...conds));
  if (!unpaid.length) return 0;
  const quotes = await quotesFor(unpaid.map((i) => i.id));
  if (!quotes.some((q) => q.asset === "NIM")) return 0;

  let txs: NimTx[];
  try {
    txs = await getNimTransactionsByAddress(merchantAddress, 100);
  } catch {
    return 0;
  }
  let found = 0;
  for (const inv of unpaid) {
    const invQuotes = quotes.filter((q) => q.invoiceId === inv.id);
    for (const tx of txs) {
      if (!nimTxMatches(inv, tx)) continue;
      const q = matchQuote(invQuotes, "NIM", BigInt(tx.value), tx.timestamp);
      if (q && (await markPaid(inv, q, tx.hash, tx.from, new Date(tx.timestamp), BigInt(tx.value)))) {
        found++;
        break;
      }
    }
  }
  return found;
}

// ---------- public shape ----------

/** What anyone with the link may see. */
export function publicInvoice(inv: Invoice) {
  return {
    id: inv.id,
    number: inv.number,
    merchantAddress: inv.merchantAddress,
    merchantName: inv.merchantName,
    acceptsUsdt: !!inv.merchantEvmAddress,
    merchantEvmAddress: inv.merchantEvmAddress,
    clientName: inv.clientName,
    items: inv.items,
    currency: inv.currency,
    total: inv.total,
    note: inv.note,
    dueDate: inv.dueDate,
    status: inv.status,
    isDemo: inv.isDemo,
    createdAt: inv.createdAt.toISOString(),
    memo: paymentMemo(inv.id),
    payment:
      inv.status === "paid"
        ? {
            asset: inv.paidAsset!,
            amount: inv.paidAmount!,
            rate: inv.paidRate!,
            txHash: inv.paidTxHash!,
            from: inv.paidFrom!,
            paidAt: inv.paidAt!.toISOString(),
          }
        : null,
  };
}
export type PublicInvoice = ReturnType<typeof publicInvoice>;

export async function getStats() {
  const db = await getDb();
  const rows = await db
    .select({
      isDemo: schema.invoices.isDemo,
      asset: schema.invoices.paidAsset,
      count: sql<number>`count(*)::int`,
      merchants: sql<number>`count(distinct ${schema.invoices.merchantAddress})::int`,
      amount: sql<string>`coalesce(sum((${schema.invoices.paidAmount})::numeric), 0)::text`,
    })
    .from(schema.invoices)
    .where(eq(schema.invoices.status, "paid"))
    .groupBy(schema.invoices.isDemo, schema.invoices.paidAsset);
  const [{ created }] = await db
    .select({ created: sql<number>`count(*)::int` })
    .from(schema.invoices)
    .where(eq(schema.invoices.isDemo, false));
  const recent = await db
    .select({
      number: schema.invoices.number,
      currency: schema.invoices.currency,
      total: schema.invoices.total,
      asset: schema.invoices.paidAsset,
      amount: schema.invoices.paidAmount,
      txHash: schema.invoices.paidTxHash,
      paidAt: schema.invoices.paidAt,
      isDemo: schema.invoices.isDemo,
    })
    .from(schema.invoices)
    .where(eq(schema.invoices.status, "paid"))
    .orderBy(desc(schema.invoices.paidAt))
    .limit(20);
  return { groups: rows, invoicesCreated: created, recent };
}
