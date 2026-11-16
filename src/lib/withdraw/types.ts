// Shared by the Withdraw screen, the API and the worker.
import type { WithdrawalStatus } from "../db/schema";

/** Approve stops being offered this long before a quote expires, so Nimiq Pay has time to pay it. */
export const APPROVE_MARGIN_MS = 60_000;

/** Statuses that never change again: the worker stops looking at them. */
export const FINAL_STATUSES: readonly WithdrawalStatus[] = ["delivered", "expired", "cancelled", "refunded", "failed"];
export const isFinal = (s: WithdrawalStatus) => FINAL_STATUSES.includes(s);

/** One withdrawal as the Withdraw screen sees it. Amounts in smallest units. */
export type WithdrawalView = {
  id: string;
  status: WithdrawalStatus;
  payWith: "NIM" | "USDT";
  chain: string;
  asset: "USDC" | "USDT";
  destination: string;
  receiveAmount: string;
  sendEstimate: string | null;
  fees: { label: string; amount: string; asset: string }[];
  providerName: string;
  /** The Lightning invoice Nimiq Pay must pay; only while the withdrawal waits for payment. */
  lightningInvoice: string | null;
  expiresAt: string | null;
  destinationTxHash: string | null;
  explorerUrl: string | null;
  /** Plain-language line for the current state, e.g. why it was refunded. */
  note: string | null;
  createdAt: string;
};
