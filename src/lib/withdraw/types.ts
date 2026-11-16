// The contract every withdrawal provider (Lendaswap now; Flashnet, Boltz… later) implements, so the
// rest of NimBill never depends on one provider. Providers run in the worker, which holds their
// secrets and claims swaps, so a user can close NimBill once they have approved in Nimiq Pay.
import type { WithdrawalFee, WithdrawalStatus } from "../db/schema";
import type { Asset, ChainId, PayWith } from "./chains";

export type QuoteRequest = {
  payWith: PayWith;
  chain: ChainId;
  asset: Asset;
  /** What the user wants to receive, in the asset's smallest unit (6 decimals). */
  receiveAmount: string;
  /** Checked with checkDestination() before it gets here. */
  destination: string;
};

export type Quote = {
  providerId: string;
  /** What the provider expects to deliver, and the least it guarantees (smallest unit). */
  receiveAmount: string;
  receiveMin: string;
  /** The Lightning amount Nimiq Pay will have to pay. */
  invoiceSats: string;
  /** The provider's and the destination network's fees. Nimiq Pay's own fee is not known here. */
  fees: WithdrawalFee[];
  /** Epoch ms. The screen stops offering Approve a safety margin before this (see APPROVE_MARGIN_MS). */
  expiresAt: number;
  etaSeconds: number;
};

/** A provider swap that exists and waits for its Lightning invoice to be paid. */
export type CreatedSwap = {
  providerId: string;
  swapId: string;
  /** BOLT11, paid in Nimiq Pay with payLightningInvoice({ invoice }). */
  lightningInvoice: string;
  invoiceSats: string;
  paymentHash: string;
  receiveMin: string;
  /** Epoch ms: the earlier of the quote's and the invoice's expiry. */
  expiresAt: number;
};

export type ProviderSwapStatus =
  | { state: "awaiting_payment" }
  | { state: "paid" } // the Lightning payment arrived; the stablecoin is locked and can be claimed
  | { state: "claiming"; txHash?: string } // claim sent, not final yet
  | { state: "delivered"; txHash: string }
  | { state: "expired" } // never paid
  | { state: "refund_pending" | "refunded" | "failed"; reason: string };

export interface WithdrawProvider {
  id: string;
  /** Shown on the review screen and the receipt ("Via Lendaswap"). */
  name: string;
  supports(chain: ChainId, asset: Asset): boolean;
  quote(req: QuoteRequest): Promise<Quote>;
  create(req: QuoteRequest, quote: Quote): Promise<CreatedSwap>;
  status(swapId: string): Promise<ProviderSwapStatus>;
  /** Releases the stablecoin to the destination fixed at create(). Gasless where the provider sponsors it. */
  claim(swapId: string): Promise<{ txHash?: string }>;
}

/** Approve stops being offered this long before a quote expires, so Nimiq Pay has time to pay it. */
export const APPROVE_MARGIN_MS = 60_000;

/** Statuses the worker no longer needs to look at. */
export const FINAL_STATUSES: readonly WithdrawalStatus[] = ["delivered", "expired", "cancelled", "refunded", "failed"];
export const isFinal = (s: WithdrawalStatus) => FINAL_STATUSES.includes(s);
