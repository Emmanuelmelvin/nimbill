import "server-only";
import { and, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Invoice, Payin, PayinStatus } from "../db/schema";
import { env } from "../env";
import { AppError, Errors } from "../errors";
import { createQuote, getInvoice, getQuoteById, isPastExpiry, newId, settleSwapPayment } from "../invoices";
import { logger } from "../logger";
import { oneclick, type OneClickStatus } from "./oneclick";
import { checkRefundAddress, formatUnits, getPayinSource, roundUpTo, sourceLabel } from "./sources";

// "Pay from another chain": a client without Nimiq Pay pays an invoice with USDT/USDC from Tron,
// BNB Chain, Solana… The money reaches the merchant as USDT on Polygon (see oneclick.ts for how).
//
//   start    lock a USDT price for the invoice, ask 1Click for a deposit address that turns what
//            the client sends into exactly that amount at the merchant's Polygon address
//   advance  read 1Click's status; once it has paid out, check the Polygon transfer and mark the
//            invoice paid (settleSwapPayment). Run by the pay screen while it is open, and by the
//            worker for payments whose page was closed.

/** After the deadline, time for the swap to finish and the USDT to land on Polygon. */
const DELIVERY_MARGIN_MS = 20 * 60_000;
/** A deposit address nothing reached is given up on this long after 1Click stops taking deposits to it. */
const GIVE_UP_AFTER_DEADLINE_MS = 60 * 60_000;
/** The worker stops looking at payments older than this. 1Click keeps an address open 72 h past the deadline. */
const WATCH_FOR_MS = 4 * 24 * 3600_000;
/** Past the time the client was given, nothing is expected: check now and then, not every run. */
const LATE_CHECK_EVERY_MS = 5 * 60_000;

const OPEN: PayinStatus[] = ["awaiting_deposit", "incomplete", "swapping"];
export const isOpen = (s: PayinStatus) => OPEN.includes(s);

export const payinsLive = () => env.PAYIN_LIVE === "true";

/** Whether this invoice can be paid from another chain right now. */
export function payinAvailable(inv: Invoice): boolean {
  return payinsLive() && !!inv.merchantEvmAddress && !inv.isDemo && inv.status === "unpaid" && !isPastExpiry(inv);
}

export async function startPayin(
  inv: Invoice,
  input: { sourceId: string; refundTo: string; tip?: number; payerEmail?: string | null },
): Promise<Payin> {
  if (!payinsLive()) throw Errors.badRequest("Paying from another chain is not available right now.");
  if (inv.isDemo) throw Errors.badRequest("The sample invoice can only be paid with Nimiq Pay.");
  if (!inv.merchantEvmAddress) throw Errors.badRequest(`${inv.merchantName} can't receive payments from other chains yet.`);
  const source = getPayinSource(input.sourceId);
  if (!source) throw Errors.badRequest("Pick a coin to pay with.");
  const refund = checkRefundAddress(source, input.refundTo);
  if (!refund.ok) throw Errors.badRequest(refund.message);

  // The price lock this payment settles: the usual USDT quote, held for the deposit window plus delivery.
  // How long the client has to send (sources.ts): 30 minutes for dollar coins, less for coins whose price moves.
  const windowMs = source.depositWindowMin * 60_000;
  const q = await createQuote(inv, "USDT", input.tip ?? 0, input.payerEmail, windowMs + DELIVERY_MARGIN_MS);
  const db = await getDb();
  const deadline = new Date(Date.now() + windowMs);
  let quote;
  try {
    quote = await oneclick.quote({
      source,
      receiveUnits: q.amount,
      recipient: inv.merchantEvmAddress,
      refundTo: refund.address,
      deadline,
    });
    if (BigInt(quote.amountOut) < BigInt(q.amount)) throw Errors.upstream("oneclick", "1Click quoted less than the invoice amount.");
  } catch (e) {
    // Nothing can pay this lock: free its unique USDT amount for other payments.
    await db.delete(schema.quotes).where(eq(schema.quotes.id, q.id));
    throw e;
  }

  const [row] = await db
    .insert(schema.payins)
    .values({
      id: `pi_${newId(16)}`,
      invoiceId: inv.id,
      quoteId: q.id,
      sourceId: source.id,
      refundTo: refund.address,
      depositAddress: quote.depositAddress,
      depositMemo: quote.depositMemo ?? null,
      sendAmount: roundUpTo(quote.amountIn, source.decimals, source.showDecimals),
      minSendAmount: quote.minAmountIn ?? null,
      receiveAmount: q.amount,
      deadline,
      providerDeadline: new Date(quote.deadline),
      correlationId: quote.correlationId ?? null,
      quoteSignature: quote.signature ?? null,
    })
    .returning();
  logger.info("payin started", { payin: row.id, invoice: inv.id, source: source.id });
  return row;
}

export async function getPayin(id: string): Promise<Payin | null> {
  const db = await getDb();
  const [p] = await db.select().from(schema.payins).where(eq(schema.payins.id, id));
  return p ?? null;
}

/**
 * Save what changed, but only if nobody moved the payment on since `p` was read (the pay screen
 * and the worker can check the same payment at once). Returns the row as it now is.
 */
async function save(p: Payin, patch: Partial<Payin>): Promise<Payin> {
  const db = await getDb();
  const [row] = await db
    .update(schema.payins)
    .set({ ...patch, updatedAt: new Date(), checkedAt: new Date() })
    .where(and(eq(schema.payins.id, p.id), eq(schema.payins.status, p.status)))
    .returning();
  return row ?? (await getPayin(p.id)) ?? p;
}

/** 1Click's status → ours, before the payout is checked on Polygon. */
export function statusFrom(st: OneClickStatus["status"]): PayinStatus {
  switch (st) {
    case "PENDING_DEPOSIT":
      return "awaiting_deposit";
    case "INCOMPLETE_DEPOSIT":
      return "incomplete";
    case "KNOWN_DEPOSIT_TX":
    case "PROCESSING":
    case "SUCCESS": // paid out, but not "paid" until the transfer is checked on Polygon
      return "swapping";
    case "REFUNDED":
      return "refunded";
    case "FAILED":
      return "failed";
  }
}

/** Move one payment forward. Safe to call often and from several places at once. */
export async function advancePayin(p: Payin, now = Date.now()): Promise<Payin> {
  if (!isOpen(p.status)) return p;
  const st = await oneclick.status(p.depositAddress, p.depositMemo);
  const lateEnough = now > (p.providerDeadline ?? p.deadline).getTime() + GIVE_UP_AFTER_DEADLINE_MS;
  if (!st) return lateEnough && p.status === "awaiting_deposit" ? save(p, { status: "expired" }) : save(p, {});

  const details = st.swapDetails ?? {};
  const patch: Partial<Payin> = {
    providerStatus: st.status,
    depositTxHash: details.originChainTxHashes?.[0]?.hash ?? p.depositTxHash,
    payoutTxHash: details.destinationChainTxHashes?.[0]?.hash ?? p.payoutTxHash,
  };
  let status = statusFrom(st.status);
  if (status === "awaiting_deposit" && lateEnough) status = "expired";
  if (status === "refunded") patch.refundedAmount = details.refundedAmount ?? null;
  if (status === "failed") logger.error("payin failed at 1Click", { payin: p.id, invoice: p.invoiceId, correlationId: p.correlationId });

  if (st.status === "SUCCESS" && patch.payoutTxHash) {
    const [inv, q] = await Promise.all([getInvoice(p.invoiceId), getQuoteById(p.quoteId)]);
    if (inv && q) {
      const r = await settleSwapPayment(inv, q, patch.payoutTxHash);
      // "paid" with another transaction: the invoice was settled some other way first.
      if (r.status === "paid") status = r.invoice.paidTxHash === patch.payoutTxHash.toLowerCase() ? "paid" : "delivered_unmatched";
      else if (r.status === "rejected") {
        status = "delivered_unmatched";
        logger.warn("payin delivered but did not pay the invoice", { payin: p.id, invoice: p.invoiceId, reason: r.message });
      }
    }
  }
  return save(p, { ...patch, status });
}

/** Worker: move every open payment forward, oldest checks first. */
export async function advanceOpenPayins(limit = 50): Promise<number> {
  if (!payinsLive()) return 0;
  const db = await getDb();
  const open = await db
    .select()
    .from(schema.payins)
    .where(
      and(
        inArray(schema.payins.status, OPEN),
        gt(schema.payins.createdAt, new Date(Date.now() - WATCH_FOR_MS)),
        // Still within the time the client was given, or not checked for a while.
        or(
          gt(schema.payins.deadline, new Date()),
          isNull(schema.payins.checkedAt),
          lt(schema.payins.checkedAt, new Date(Date.now() - LATE_CHECK_EVERY_MS)),
        ),
      ),
    )
    .orderBy(schema.payins.checkedAt)
    .limit(limit);
  let moved = 0;
  for (const p of open) {
    try {
      const next = await advancePayin(p);
      if (next.status !== p.status) moved++;
    } catch (e) {
      logger.warn("payin check failed", { payin: p.id, error: (e as Error).message, code: AppError.is(e) ? e.code : undefined });
    }
  }
  return moved;
}

const MESSAGES: Record<PayinStatus, string> = {
  awaiting_deposit: "Waiting for your payment…",
  incomplete: "Part of the payment arrived. Send the rest before the time runs out, or it all goes back to your refund address.",
  swapping: "Payment received. Sending it on to the merchant…",
  paid: "Paid.",
  delivered_unmatched:
    "Your payment reached the merchant, but this invoice was already paid or closed. Contact the merchant to sort it out.",
  refunded: "This payment couldn't go through, so the money was sent back to your refund address.",
  failed: "Something went wrong with this payment. Contact the merchant and share the reference below.",
  expired: "Nothing arrived in time, so this payment address has closed. Start again to get a new one.",
};

/** What the pay screen may see about a payment. */
export function publicPayin(p: Payin) {
  const source = getPayinSource(p.sourceId)!;
  return {
    id: p.id,
    sourceId: p.sourceId,
    sourceLabel: sourceLabel(source),
    asset: source.asset,
    chain: source.chain,
    /** "native": the price moves, so the amount carries a buffer and the time to send is shorter. */
    kind: source.kind,
    depositAddress: p.depositAddress,
    depositMemo: p.depositMemo,
    /** What to send, e.g. "150.8". Already rounded up to the cent. */
    sendAmount: formatUnits(p.sendAmount, source.decimals),
    /** The USDT the merchant receives, e.g. "150.004321". */
    receiveAmount: formatUnits(p.receiveAmount, 6),
    refundTo: p.refundTo,
    deadline: p.deadline.toISOString(),
    status: p.status,
    message: MESSAGES[p.status],
    depositTx: p.depositTxHash ? { hash: p.depositTxHash, url: source.explorerTx(p.depositTxHash) } : null,
    refundedAmount: p.refundedAmount ? formatUnits(p.refundedAmount, source.decimals) : null,
    reference: p.correlationId ?? p.id,
  };
}
export type PublicPayin = ReturnType<typeof publicPayin>;
