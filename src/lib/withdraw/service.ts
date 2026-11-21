import "server-only";
import { and, desc, eq, gt, inArray, lt, or } from "drizzle-orm";
import { LUNA_PER_NIM } from "../currencies";
import { getDb, schema } from "../db";
import type { Withdrawal, WithdrawalFee, WithdrawalStatus } from "../db/schema";
import { env } from "../env";
import { Errors } from "../errors";
import { newId } from "../invoices";
import { logger } from "../logger";
import { getAllRates } from "../rates";
import { checkDestination } from "./address";
import { findRoute, getChain, type Chain, type Token } from "./chains";
import { checkDelivery } from "./evm";
import { lendaswap, PROVIDER_ID, PROVIDER_NAME, type LendaswapQuote, type LendaswapSwap } from "./lendaswap";
import { sampleQuote } from "./sample";
import type { QuoteBody, QuoteView } from "./schemas";
import { isFinal, type WithdrawalView } from "./types";

// Real withdrawals, end to end: quote, create the swap, record what Nimiq Pay did, then move each
// withdrawal forward (`advance`) until its money is delivered or back with the user. `advance` runs
// in the worker every few seconds and whenever the Withdraw screen asks for the status, so a
// withdrawal finishes even if the user closes NimBill.

const UNITS = 1_000_000; // USDC / USDT: 6 decimals
/** Room for Nimiq Pay's own NIM → Lightning fee, which NimBill can't know in advance. */
const NIMIQ_PAY_ALLOWANCE = 0.01;
const QUOTE_FRESH_MS = 3 * 60_000; // the screen offers Approve until 1 minute before this
/** Maximum upward drift (2%) allowed between the Review screen's quote and the swap created on Approve. */
export const MAX_QUOTE_DRIFT = 0.02;
/** Window during which a "cancelled" withdrawal is still checked in case Nimiq Pay sent the Lightning payment before throwing. */
const CANCEL_RESCUE_MS = 30 * 60_000;
/** A withdrawal that has been paid but not delivered after this long gets flagged in the logs. */
export const STUCK_AFTER_MS = 30 * 60_000;

const FUNDED_PROVIDER_STATUSES = new Set([
  "clientfundingseen",
  "clientfunded",
  "serverfunded",
  "clientredeeming",
  "clientredeemed",
  "serverredeemed",
]);

/** True when the swap's fresh `sendEstimate` drifted upward by more than `MAX_QUOTE_DRIFT` (2%) from `expectedSendEstimate`. */
export function hasExcessiveQuoteDrift(freshEstimate: string | number | bigint, expectedEstimate?: string | null): boolean {
  if (!expectedEstimate) return false;
  const fresh = Number(freshEstimate);
  const expected = Number(expectedEstimate);
  if (!Number.isFinite(fresh) || !Number.isFinite(expected) || expected <= 0) return false;
  return fresh > Math.ceil(expected * (1 + MAX_QUOTE_DRIFT));
}

/**
 * True when the created swap's Lightning invoice (`invoiceSats`, what Nimiq Pay actually pays)
 * asks for more than `MAX_QUOTE_DRIFT` above the quote it was priced from (`quotedSats`).
 */
export function swapCostsMoreThanQuoted(invoiceSats: string | number, quotedSats: number): boolean {
  const sats = Number(invoiceSats);
  if (!Number.isFinite(sats) || !Number.isFinite(quotedSats) || quotedSats <= 0) return true;
  return sats > Math.ceil(quotedSats * (1 + MAX_QUOTE_DRIFT));
}

export const withdrawalsLive = () => env.WITHDRAW_LIVE === "true";

type Route = { chain: Chain; token: Token; destination: string; receiveUnits: string };

/** Check a quote request against the chain list and the destination rules. */
function resolve(body: QuoteBody): Route {
  const route = findRoute(body.chain, body.asset, body.payWith);
  if (!route) throw Errors.validation(`${body.asset} on that chain is not available when paying with ${body.payWith}.`);
  const destination = checkDestination(route.chain, body.destination);
  if (!destination.ok) throw Errors.validation(destination.message);
  const receiveUnits = String(Math.round(Number(body.receive) * UNITS));
  return { ...route, destination: destination.address, receiveUnits };
}

/** Fees and the "about" cost, from the provider's quote (sats) and live prices. */
async function price(body: QuoteBody, q: LendaswapQuote, asset: string) {
  const sats = Number(q.net_source_amount);
  if (sats < q.min_amount) throw Errors.validation("That amount is below the provider's minimum. Try a little more.");
  if (sats > q.max_amount) throw Errors.validation("That amount is above the provider's maximum. Try a little less.");
  const usdPerSat = Number(q.exchange_rate) / 1e8; // the target is a dollar stablecoin
  const toUnits = (s: number) => String(Math.round(s * usdPerSat * UNITS));
  const fees: WithdrawalFee[] = [
    { label: "Provider fee", amount: toUnits(q.protocol_fee), asset },
    { label: "Network fee", amount: toUnits(q.network_fee + q.gasless_network_fee), asset },
  ];
  const usd = sats * usdPerSat * (1 + NIMIQ_PAY_ALLOWANCE);
  const rates = await getAllRates("USD");
  const sendEstimate = body.payWith === "NIM" ? Math.ceil((usd / rates.NIM) * LUNA_PER_NIM) : Math.ceil((usd / rates.USDT) * UNITS);
  return { fees, sendEstimate: String(sendEstimate), sats };
}

/** A quote for the review screen: live from Lendaswap when withdrawals are on, a sample otherwise. */
export async function quote(body: QuoteBody): Promise<QuoteView> {
  const r = resolve(body);
  if (!withdrawalsLive()) return sampleQuote(body, r.destination);
  const q = await lendaswap.quote(r.chain, r.token, r.receiveUnits);
  const { fees, sendEstimate } = await price(body, q, body.asset);
  return {
    sample: false,
    providerName: PROVIDER_NAME,
    payWith: body.payWith,
    chain: body.chain,
    asset: body.asset,
    destination: r.destination,
    receiveAmount: q.net_target_amount,
    receiveMin: q.net_target_amount,
    sendEstimate,
    fees,
    expiresAt: new Date(Date.now() + QUOTE_FRESH_MS).toISOString(),
    etaSeconds: 120,
  };
}

/** Create the withdrawal and its provider swap. Returns it with the Lightning invoice to pay. */
export async function createWithdrawal(nimiqAddress: string, body: QuoteBody): Promise<Withdrawal> {
  if (!withdrawalsLive()) throw Errors.forbidden("Withdrawals aren't switched on yet. This was a sample quote.");
  const r = resolve(body);
  const q = await lendaswap.quote(r.chain, r.token, r.receiveUnits);
  const { fees, sendEstimate, sats: quotedSats } = await price(body, q, body.asset);
  if (hasExcessiveQuoteDrift(sendEstimate, body.expectedSendEstimate)) {
    throw Errors.conflict("The exchange rate moved since your quote was shown. Please review the updated quote before approving.");
  }
  const id = `wd_${newId(12)}`;
  const swap = await lendaswap.create(r.chain, r.token, r.receiveUnits, r.destination);

  // Never hand the user an invoice for a swap that isn't exactly what we asked for.
  const problems = [
    swap.evm_chain_id !== r.chain.evmChainId && "chain",
    swap.target_evm_address && swap.target_evm_address.toLowerCase() !== r.destination.toLowerCase() && "destination",
    BigInt(swap.target_amount) < BigInt(r.receiveUnits) && "amount",
  ].filter(Boolean);
  if (problems.length) {
    logger.error("lendaswap swap does not match the request; not paying it", { id, swapId: swap.id, problems });
    throw Errors.upstream("lendaswap", "The swap provider answered with a different swap. Nothing was paid; try again.");
  }
  // The quote check above covers the rate; this covers the invoice the user really pays, which the
  // provider sets when the swap is created. An unpaid swap simply expires at the provider.
  if (swapCostsMoreThanQuoted(swap.source_amount, quotedSats)) {
    logger.warn("lendaswap invoice costs more than the quote; not paying it", {
      id,
      swapId: swap.id,
      invoiceSats: swap.source_amount,
      quotedSats,
    });
    throw Errors.conflict("The swap came back more expensive than quoted. Nothing was paid; review the new quote and try again.");
  }

  const expiresAt = swap.invoice_expires_at ? new Date(swap.invoice_expires_at * 1000) : new Date(Date.now() + 10 * 60_000);
  const db = await getDb();
  const now = new Date();
  const [row] = await db
    .insert(schema.withdrawals)
    .values({
      id,
      nimiqAddress,
      payWith: body.payWith,
      chain: r.chain.id,
      asset: body.asset,
      destination: r.destination,
      receiveAmount: swap.target_amount,
      receiveMin: swap.target_amount,
      sendEstimate,
      fees,
      providerId: PROVIDER_ID,
      providerSwapId: swap.id,
      lightningInvoice: swap.bolt11_invoice,
      invoiceSats: swap.source_amount,
      invoicePaymentHash: swap.hash_lock,
      quoteExpiresAt: expiresAt,
      status: "quoted",
      statusHistory: [{ status: "quoted", at: now.toISOString() }],
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  logger.info("withdrawal created", { id, swapId: swap.id, chain: r.chain.id, asset: body.asset, sats: swap.source_amount });
  return row;
}

async function load(id: string, nimiqAddress?: string): Promise<Withdrawal> {
  const db = await getDb();
  const [w] = await db.select().from(schema.withdrawals).where(eq(schema.withdrawals.id, id));
  // Someone else's withdrawal is "not found", not "forbidden": its existence is private too.
  if (!w || (nimiqAddress && w.nimiqAddress !== nimiqAddress)) throw Errors.notFound("Withdrawal not found.");
  return w;
}

/** Move a withdrawal to `status`, recording when (and why) in its history. */
/** Exported for scripts/test-withdraw-status.ts only; app code goes through advance/markPaid/markCancelled. */
export async function setStatus(
  w: Withdrawal,
  status: WithdrawalStatus,
  changes: Partial<Withdrawal> = {},
  note?: string,
): Promise<Withdrawal> {
  const db = await getDb();
  const now = new Date();
  const history =
    status === w.status ? w.statusHistory : [...w.statusHistory, { status, at: now.toISOString(), ...(note ? { note } : {}) }];
  // Only from the status we read: the worker, the status screen, the history list and the cancel
  // call can all advance the same withdrawal at once, and a slower one must never move it back
  // (say "delivered" to "delivering") or cancel one that has moved on. The loser gets the current row.
  const [row] = await db
    .update(schema.withdrawals)
    .set({ ...changes, status, statusHistory: history, updatedAt: now, ...(note && status !== w.status ? { failureReason: note } : {}) })
    .where(and(eq(schema.withdrawals.id, w.id), eq(schema.withdrawals.status, w.status)))
    .returning();
  if (!row) {
    const [current] = await db.select().from(schema.withdrawals).where(eq(schema.withdrawals.id, w.id));
    logger.info("withdrawal moved on concurrently; keeping its newer status", { id: w.id, wanted: status, current: current?.status });
    return current ?? w;
  }
  if (status !== w.status) logger.info("withdrawal status", { id: w.id, from: w.status, to: status, note });
  return row;
}

/** Nimiq Pay accepted the payment (`payLightningInvoice` resolved). */
export async function markPaid(nimiqAddress: string, id: string, pay: { hash?: string; swapId?: string }): Promise<Withdrawal> {
  const w = await load(id, nimiqAddress);
  if (w.status !== "quoted" && w.status !== "cancelled") return w; // already moved on (the worker may have seen the payment first)
  return setStatus(w, "paying", { payTxHash: pay.hash ?? null, paySwapId: pay.swapId ?? null, failureReason: null });
}

/**
 * The user declined in Nimiq Pay, or Nimiq Pay refused: nothing was spent.
 * Checks the provider first in case Nimiq Pay actually submitted the Lightning payment right before
 * throwing a bridge/timeout error — if the provider already saw the payment, advances the swap instead
 * of stranding it in `cancelled`.
 */
export async function markCancelled(nimiqAddress: string, id: string, reason: string): Promise<Withdrawal> {
  const w = await load(id, nimiqAddress);
  if (w.status !== "quoted") return w;
  if (w.providerId === PROVIDER_ID && w.providerSwapId) {
    try {
      const swap = await lendaswap.get(w.providerSwapId);
      if (FUNDED_PROVIDER_STATUSES.has(swap.status)) {
        logger.warn("markCancelled called on a funded swap; advancing instead of cancelling", {
          id: w.id,
          swapId: w.providerSwapId,
          providerStatus: swap.status,
        });
        return await advance(w);
      }
    } catch (e) {
      logger.warn("markCancelled provider check failed; worker will re-verify", { id: w.id, error: (e as Error).message });
    }
  }
  return setStatus(w, "cancelled", {}, reason);
}

/** Look at the provider (and the chain) and move the withdrawal forward. Safe to run any time. */
export async function advance(w: Withdrawal): Promise<Withdrawal> {
  const canRescueCancelled = w.status === "cancelled" && Date.now() - w.createdAt.getTime() < CANCEL_RESCUE_MS;
  if ((isFinal(w.status) && !canRescueCancelled) || w.providerId !== PROVIDER_ID || !w.providerSwapId) return w;
  const route = findRoute(w.chain, w.asset, w.payWith);
  if (!route) return w.status === "cancelled" ? w : setStatus(w, "failed", {}, "This chain or token is no longer offered.");
  const swap = await lendaswap.get(w.providerSwapId);
  const status = swap.status as LendaswapSwap["status"];
  if (w.status === "cancelled" && !FUNDED_PROVIDER_STATUSES.has(status)) {
    return w;
  }

  switch (status) {
    case "pending": {
      const expired = w.quoteExpiresAt && Date.now() > w.quoteExpiresAt.getTime() + 60_000;
      if (!expired) return w;
      return setStatus(
        w,
        "expired",
        {},
        w.status === "paying"
          ? "The payment never reached the provider, so nothing was taken. If Nimiq Pay sent anything, it returns it."
          : "The invoice ran out before it was paid. Nothing was spent.",
      );
    }
    case "clientfundingseen":
    case "clientfunded":
      return setStatus(w, "swapping");
    case "serverfunded": {
      // The stablecoin side is locked for us: claim it now (gasless).
      const txHash = await lendaswap.claim(swap.id);
      return setStatus(w, "delivering", { destinationTxHash: txHash ?? w.destinationTxHash });
    }
    case "clientredeeming":
    case "clientredeemed":
    case "serverredeemed": {
      const txHash = swap.evm_claim_txid || w.destinationTxHash;
      if (!txHash) return setStatus(w, "delivering");
      const d = await checkDelivery(route.chain.id, txHash, route.token.contract, w.destination);
      if (d.state === "final") return setStatus(w, "delivered", { destinationTxHash: txHash, receiveAmount: String(d.amount) });
      if (d.state === "failed") return setStatus(w, "failed", { destinationTxHash: txHash }, d.reason);
      return setStatus(w, "delivering", { destinationTxHash: txHash });
    }
    case "expired":
      return setStatus(w, "expired", {}, "The invoice ran out before it was paid. Nothing was spent.");
    case "clientrefunded":
    case "clientrefundedserverrefunded":
    case "clientfundedserverrefunded":
    case "serverwontfund":
    case "clientfundedtoolate":
    case "clientinvalidfunded":
      // The held Lightning payment is cancelled, so Nimiq Pay gets it back and returns the NIM.
      return setStatus(
        w,
        "refunded",
        {},
        "The provider couldn't complete the swap and cancelled the held payment. Nimiq Pay returns your money; this can take a few minutes.",
      );
    default:
      logger.error("withdrawal needs a human", { id: w.id, swapId: swap.id, providerStatus: status });
      return setStatus(w, "failed", {}, `The provider reported "${status}". We're looking into it; keep your swap ID ${swap.id}.`);
  }
}

/** The signed-in user's withdrawal, brought up to date first (at most every few seconds). */
export async function getWithdrawal(nimiqAddress: string, id: string): Promise<Withdrawal> {
  const w = await load(id, nimiqAddress);
  if (isFinal(w.status) || Date.now() - w.updatedAt.getTime() < 3_000) return w;
  try {
    return await advance(w);
  } catch (e) {
    logger.warn("withdrawal advance failed", { id, error: (e as Error).message });
    return w; // show the last known state; the worker keeps trying
  }
}

const OPEN: WithdrawalStatus[] = ["quoted", "paying", "swapping", "delivering"];

/** Recent withdrawals for the signed-in user (newest first), bringing any open ones up to date. */
export async function listWithdrawals(nimiqAddress: string, limit = 15): Promise<Withdrawal[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.withdrawals)
    .where(eq(schema.withdrawals.nimiqAddress, nimiqAddress))
    .orderBy(desc(schema.withdrawals.createdAt))
    .limit(limit);

  // In parallel: each open row asks the provider, and one slow answer shouldn't hold up the list.
  return Promise.all(
    rows.map(async (w) => {
      const recentlyCancelled = w.status === "cancelled" && Date.now() - w.createdAt.getTime() < CANCEL_RESCUE_MS;
      const needsAdvance = (!isFinal(w.status) || recentlyCancelled) && Date.now() - w.updatedAt.getTime() >= 3_000;
      if (!needsAdvance) return w;
      try {
        return await advance(w);
      } catch (e) {
        logger.warn("withdrawal list advance failed", { id: w.id, error: (e as Error).message });
        return w;
      }
    }),
  );
}

/** Worker job: bring every open withdrawal (plus recently cancelled ones in case Nimiq Pay paid before throwing) forward. */
export async function advanceOpenWithdrawals(limit = 25): Promise<number> {
  const db = await getDb();
  const rescueSince = new Date(Date.now() - CANCEL_RESCUE_MS);
  const open = await db
    .select()
    .from(schema.withdrawals)
    .where(
      and(
        or(
          inArray(schema.withdrawals.status, OPEN),
          and(eq(schema.withdrawals.status, "cancelled"), gt(schema.withdrawals.createdAt, rescueSince)),
        ),
        lt(schema.withdrawals.updatedAt, new Date(Date.now() - 4_000)),
      ),
    )
    .limit(limit);
  for (const w of open) {
    try {
      await advance(w);
    } catch (e) {
      logger.warn("withdrawal advance failed", { id: w.id, error: (e as Error).message });
    }
  }
  return open.length;
}

/** Worker job: flag withdrawals that were paid but are still not delivered after 30 minutes. */
export async function reportStuckWithdrawals(): Promise<number> {
  const db = await getDb();
  const stuck = await db
    .select({ id: schema.withdrawals.id, status: schema.withdrawals.status, swapId: schema.withdrawals.providerSwapId })
    .from(schema.withdrawals)
    .where(
      and(
        inArray(schema.withdrawals.status, ["paying", "swapping", "delivering"]),
        lt(schema.withdrawals.createdAt, new Date(Date.now() - STUCK_AFTER_MS)),
      ),
    );
  for (const s of stuck) logger.error("withdrawal stuck for over 30 minutes", s);
  return stuck.length;
}

export function toView(w: Withdrawal): WithdrawalView {
  const chain = getChain(w.chain);
  const note = w.status === "delivering" && w.destinationTxHash ? "Sent. Waiting for it to be final on the chain." : w.failureReason;
  return {
    id: w.id,
    status: w.status,
    payWith: w.payWith,
    chain: w.chain,
    asset: w.asset,
    destination: w.destination,
    receiveAmount: w.receiveAmount,
    sendEstimate: w.sendEstimate,
    fees: w.fees,
    providerName: PROVIDER_NAME,
    lightningInvoice: w.status === "quoted" ? w.lightningInvoice : null,
    expiresAt: w.quoteExpiresAt?.toISOString() ?? null,
    destinationTxHash: w.destinationTxHash,
    explorerUrl: w.destinationTxHash && chain ? chain.explorerTx(w.destinationTxHash) : null,
    note: isFinal(w.status) || w.status === "delivering" ? note : null,
    createdAt: w.createdAt.toISOString(),
  };
}
