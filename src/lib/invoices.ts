import "server-only";
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { getAddress } from "viem";
import { getDb, schema } from "./db";
import type { Invoice, LineItem, Quote } from "./db/schema";
import { Errors } from "./errors";
import { notifyInvoicePaid } from "./notifications";
import { metrics } from "./observability";
import { nimbillNumber } from "./nimbill-number";
import { getRate } from "./rates";
import { LUNA_PER_NIM, USDT_DECIMALS } from "./currencies";
import { decodeData, nimiq, polygon, sameNimAddress, type NimTx } from "./clients";
import { PRICE_LOCK_GRACE_MS, PRICE_LOCK_MS, txHashUsed, uniqueUsdtAmount } from "./usdt-amounts";

export const QUOTE_TTL_MS = PRICE_LOCK_MS;
// A payment broadcast just before a quote expires still counts if it lands within this window.
const QUOTE_GRACE_MS = PRICE_LOCK_GRACE_MS;

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

/** The merchant's next "INV-0001"-style number. */
async function nextInvoiceNumber(merchantAddress: string): Promise<string> {
  const db = await getDb();
  const [{ invoiceCounter }] = await db
    .update(schema.merchants)
    .set({ invoiceCounter: sql`${schema.merchants.invoiceCounter} + 1` })
    .where(eq(schema.merchants.address, merchantAddress))
    .returning({ invoiceCounter: schema.merchants.invoiceCounter });
  return `INV-${String(invoiceCounter).padStart(4, "0")}`;
}

/** A board invoice was just paid: give it the merchant's next number. */
async function assignBoardNumber(inv: Invoice): Promise<Invoice> {
  const db = await getDb();
  const [numbered] = await db
    .update(schema.invoices)
    .set({ number: await nextInvoiceNumber(inv.merchantAddress) })
    .where(eq(schema.invoices.id, inv.id))
    .returning();
  return numbered ?? inv;
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
  /** "board": made by a visitor on the merchant's board. Numbered when paid (see assignBoardNumber). */
  source?: "direct" | "board";
  productId?: string | null;
}): Promise<Invoice> {
  const db = await getDb();
  await ensureMerchant(input.merchantAddress);
  const id = newId();
  const board = input.source === "board";
  const number = input.isDemo
    ? `DEMO-${newId(4).toUpperCase()}`
    : board
      ? nimbillNumber(id)
      : await nextInvoiceNumber(input.merchantAddress);
  const [inv] = await db
    .insert(schema.invoices)
    .values({
      id,
      number,
      source: board ? "board" : "direct",
      productId: input.productId ?? null,
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
    .where(
      and(
        eq(schema.invoices.merchantAddress, merchantAddress),
        eq(schema.invoices.isDemo, false),
        // Unpaid board invoices were made by visitors and may never be paid: they live in Board → Orders.
        or(eq(schema.invoices.source, "direct"), eq(schema.invoices.status, "paid")),
      ),
    )
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

/**
 * Record the first time the client opened an unpaid invoice. Only the first view sticks, so
 * repeat visits and races cost one no-op update at most. Returns the invoice as it is now.
 */
export async function markViewed(inv: Invoice): Promise<Invoice> {
  if (inv.viewedAt || inv.status !== "unpaid" || inv.isDemo) return inv;
  const db = await getDb();
  const [row] = await db
    .update(schema.invoices)
    .set({ viewedAt: new Date() })
    .where(and(eq(schema.invoices.id, inv.id), isNull(schema.invoices.viewedAt), eq(schema.invoices.status, "unpaid")))
    .returning();
  return row ?? inv;
}

// ---------- quotes (rate lock) ----------

/**
 * Lock a price for paying `inv` with `asset`. `tip` is what the client chose to add on top, in the
 * invoice currency: it is priced into the amount, so the tip reaches the merchant in the same
 * transaction, and is recorded on the invoice when that payment is verified.
 */
export async function createQuote(inv: Invoice, asset: "NIM" | "USDT", tip = 0): Promise<Quote> {
  if (inv.status !== "unpaid")
    throw Errors.badRequest(inv.status === "paid" ? "This invoice is already paid." : "This invoice was cancelled.");
  if (asset === "USDT" && !inv.merchantEvmAddress) throw Errors.badRequest("This merchant does not accept USDT yet.");
  // Sample invoices show the basic flow; they take no tips.
  const tipFiat = inv.isDemo ? 0 : Math.max(0, Math.round(tip * 100) / 100);
  const rate = await getRate(asset, inv.currency);
  const coins = (Number(inv.total) + tipFiat) / rate;
  // Round up to 0.01 of the coin so the merchant never receives less than the invoice total.
  const unit = asset === "NIM" ? LUNA_PER_NIM : 10 ** USDT_DECIMALS;
  const step = unit / 100;
  let amount = BigInt(Math.max(step, Math.ceil((coins * unit) / step) * step));
  // USDT transfers can't carry a reference, so the amount itself identifies the invoice.
  if (asset === "USDT") amount = await uniqueUsdtAmount(inv.merchantEvmAddress!, amount);
  const db = await getDb();
  const [q] = await db
    .insert(schema.quotes)
    .values({
      id: newId(12),
      invoiceId: inv.id,
      asset,
      amount: amount.toString(),
      rate: String(rate),
      tip: tipFiat.toFixed(2),
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

/**
 * The quote this payment settles, sent before the lock (plus grace) expired.
 * NIM: largest quote the value covers (the memo already identifies the invoice).
 * USDT: the amount must match exactly, because the unique amount is what identifies the invoice.
 */
function matchQuote(quotes: Quote[], asset: "NIM" | "USDT", value: bigint, txTime: number): Quote | null {
  const ok = quotes
    .filter((q) => q.asset === asset && (asset === "USDT" ? value === BigInt(q.amount) : value >= BigInt(q.amount)))
    .filter((q) => txTime >= q.createdAt.getTime() - 60_000 && txTime <= q.expiresAt.getTime() + QUOTE_GRACE_MS);
  ok.sort((a, b) => Number(BigInt(b.amount) - BigInt(a.amount)));
  return ok[0] ?? null;
}

/** Dollar value of a payment at the current price, or null when prices are unavailable (backfilled later). */
async function usdValue(asset: "NIM" | "USDT", value: bigint): Promise<string | null> {
  try {
    const coins = Number(value) / (asset === "NIM" ? LUNA_PER_NIM : 10 ** USDT_DECIMALS);
    return (coins * (await getRate(asset, "USD"))).toFixed(6);
  } catch {
    return null;
  }
}

async function markPaid(inv: Invoice, q: Quote, txHash: string, from: string, paidAt: Date, value: bigint): Promise<Invoice | null> {
  // Already counted as a tag transfer (or another invoice): it can't pay this invoice too.
  if (await txHashUsed(txHash)) return null;
  const db = await getDb();
  const paidUsd = await usdValue(q.asset, value);
  let updated: Invoice | undefined;
  try {
    [updated] = await db
      .update(schema.invoices)
      .set({
        status: "paid",
        paidAsset: q.asset,
        paidAmount: value.toString(),
        paidRate: q.rate,
        paidTxHash: txHash.toLowerCase(),
        paidFrom: from,
        paidAt,
        paidUsd,
        paidTip: Number(q.tip) > 0 ? q.tip : null,
      })
      .where(and(eq(schema.invoices.id, inv.id), eq(schema.invoices.status, "unpaid"), isNull(schema.invoices.paidTxHash)))
      .returning();
  } catch {
    // unique(paid_tx_hash): this transaction already paid another invoice
    return null;
  }
  // The update only matches while the invoice is still unpaid, so exactly one caller ever gets
  // a row back here, however often verify or recovery run. That makes this the one place to
  // announce the payment (it only schedules the email; it cannot throw or slow this down),
  // and to number a board invoice.
  if (!updated) return null;
  const final = updated.source === "board" && !updated.isDemo ? await assignBoardNumber(updated) : updated;
  notifyInvoicePaid(final);
  return final;
}

export type VerifyResult =
  { status: "paid"; invoice: Invoice } | { status: "pending"; message: string } | { status: "rejected"; message: string };

function nimTxMatches(inv: Invoice, tx: NimTx): boolean {
  return tx.executionResult && sameNimAddress(tx.to, inv.merchantAddress) && decodeData(tx.recipientData).trim() === paymentMemo(inv.id);
}

/** Verify a specific transaction hash the payer's wallet returned. */
export async function verifyPayment(inv: Invoice, asset: "NIM" | "USDT", txHash: string): Promise<VerifyResult> {
  if (inv.status === "paid") return { status: "paid", invoice: inv };
  if (inv.status === "cancelled") return { status: "rejected", message: "This invoice was cancelled." };
  const quotes = await quotesFor([inv.id]);

  if (asset === "NIM") {
    if (!/^[0-9a-f]{64}$/i.test(txHash)) return { status: "rejected", message: "Invalid transaction hash." };
    const tx = await nimiq.getTransaction(txHash.toLowerCase());
    if (!tx) return { status: "pending", message: "Waiting for the transaction to be included in a block…" };
    if (!tx.executionResult) return { status: "rejected", message: "The transaction failed on-chain." };
    if (!nimTxMatches(inv, tx)) return { status: "rejected", message: "This transaction does not pay this invoice." };
    const q = matchQuote(quotes, "NIM", BigInt(tx.value), tx.timestamp);
    if (!q) return { status: "rejected", message: "The amount paid is lower than the locked price, or the price lock expired." };
    const updated = await markPaid(inv, q, tx.hash, tx.from, new Date(tx.timestamp), BigInt(tx.value));
    if (updated) {
      metrics.invoicePaid("NIM", "hash");
      return { status: "paid", invoice: updated };
    }
    const fresh = await getInvoice(inv.id);
    return fresh?.status === "paid"
      ? { status: "paid", invoice: fresh }
      : { status: "rejected", message: "This transaction was already used." };
  }

  if (!/^0x[0-9a-f]{64}$/i.test(txHash)) return { status: "rejected", message: "Invalid transaction hash." };
  if (!inv.merchantEvmAddress) return { status: "rejected", message: "This merchant does not accept USDT." };
  const tx = await polygon.getUsdtTransfers(txHash);
  if (tx.status === "pending") return { status: "pending", message: "Waiting for Polygon to confirm the transaction…" };
  if (tx.status === "reverted") return { status: "rejected", message: "This USDT transaction failed on-chain." };
  const merchant = getAddress(inv.merchantEvmAddress);
  const t = tx.transfers.find((x) => getAddress(x.to) === merchant);
  if (!t) return { status: "rejected", message: "This transaction does not send USDT to the merchant." };
  if (!t.confirmed) return { status: "pending", message: "Confirming on Polygon…" };
  const q = matchQuote(quotes, "USDT", t.value, t.timestamp);
  if (!q)
    return { status: "rejected", message: "The amount paid doesn't match the locked price for this invoice, or the price lock expired." };
  const updated = await markPaid(inv, q, txHash, t.from, new Date(t.timestamp), t.value);
  if (updated) {
    metrics.invoicePaid("USDT", "hash");
    return { status: "paid", invoice: updated };
  }
  const fresh = await getInvoice(inv.id);
  return fresh?.status === "paid"
    ? { status: "paid", invoice: fresh }
    : { status: "rejected", message: "This transaction was already used." };
}

/**
 * Find payments for unpaid invoices that we never got a transaction hash for: the payer closed
 * the app too early, or paid NIM from another wallet via the payment link / QR.
 * NIM: scan the merchant's recent transactions for the invoice memo.
 * USDT: scan Polygon for transfers to the merchant during each price lock, matched by exact amount.
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
  const unpaid = await db
    .select()
    .from(schema.invoices)
    .where(and(...conds));
  if (!unpaid.length) return 0;
  const quotes = await quotesFor(unpaid.map((i) => i.id));
  const paid = new Set<string>();
  if (quotes.some((q) => q.asset === "NIM")) await reconcileNim(merchantAddress, unpaid, quotes, paid);
  const stillUnpaid = unpaid.filter((i) => !paid.has(i.id));
  if (quotes.some((q) => q.asset === "USDT" && !paid.has(q.invoiceId))) await reconcileUsdt(stillUnpaid, quotes, paid);
  return paid.size;
}

async function reconcileNim(merchantAddress: string, unpaid: Invoice[], quotes: Quote[], paid: Set<string>) {
  let txs: NimTx[];
  try {
    txs = await nimiq.getTransactionsByAddress(merchantAddress, 100);
  } catch {
    return;
  }
  for (const inv of unpaid) {
    const invQuotes = quotes.filter((q) => q.invoiceId === inv.id);
    for (const tx of txs) {
      if (!nimTxMatches(inv, tx)) continue;
      const q = matchQuote(invQuotes, "NIM", BigInt(tx.value), tx.timestamp);
      if (q && (await markPaid(inv, q, tx.hash, tx.from, new Date(tx.timestamp), BigInt(tx.value)))) {
        paid.add(inv.id);
        metrics.invoicePaid("NIM", "recovery");
        break;
      }
    }
  }
}

const MAX_USDT_QUOTES_SCANNED = 30;

async function reconcileUsdt(unpaid: Invoice[], quotes: Quote[], paid: Set<string>) {
  const byId = new Map(unpaid.map((i) => [i.id, i]));
  // Most recent price locks first; each one is a ~9-minute window to search.
  const usdtQuotes = quotes
    .filter((q) => q.asset === "USDT" && byId.get(q.invoiceId)?.merchantEvmAddress)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, MAX_USDT_QUOTES_SCANNED);

  // Invoices keep the Polygon address they were created with, so group by it.
  const groups = new Map<string, Quote[]>();
  for (const q of usdtQuotes) {
    const addr = byId.get(q.invoiceId)!.merchantEvmAddress!.toLowerCase();
    groups.set(addr, [...(groups.get(addr) ?? []), q]);
  }

  for (const [addr, qs] of groups) {
    const now = Date.now();
    const windows = qs.map((q) => ({
      fromMs: q.createdAt.getTime() - 60_000,
      toMs: Math.min(now, q.expiresAt.getTime() + QUOTE_GRACE_MS),
    }));
    let transfers;
    try {
      transfers = await polygon.getUsdtTransfersTo(addr, windows);
    } catch {
      continue; // RPC hiccup: the next page load tries again
    }
    for (const t of transfers) {
      if (!t.confirmed) continue; // picked up once it has enough confirmations
      // Exact amount + time window. Pay only when it points to exactly one invoice.
      const hits = [...new Set(qs.map((q) => q.invoiceId))]
        .map((id) => ({
          inv: byId.get(id)!,
          q: matchQuote(
            qs.filter((q) => q.invoiceId === id),
            "USDT",
            t.value,
            t.timestamp,
          ),
        }))
        .filter((h): h is { inv: Invoice; q: Quote } => !!h.q && !paid.has(h.inv.id));
      if (hits.length !== 1) continue;
      const { inv, q } = hits[0];
      if (await markPaid(inv, q, t.hash, t.from, new Date(t.timestamp), t.value)) {
        paid.add(inv.id);
        metrics.invoicePaid("USDT", "recovery");
      }
    }
  }
}

// ---------- public shape ----------

/** What anyone with the link may see. */
export function publicInvoice(inv: Invoice) {
  return {
    id: inv.id,
    number: inv.number,
    nimbillNumber: nimbillNumber(inv.id),
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
            /** The client's tip in the invoice currency, included in `amount`. Null when there was none. */
            tip: inv.paidTip,
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
