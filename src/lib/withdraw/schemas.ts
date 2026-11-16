// Request bodies for the withdraw routes, shared with the Withdraw screen so both check the same rules.
import { z } from "zod";
import { ASSETS, CHAIN_IDS, PAY_WITH } from "./chains";

/** Smallest and largest amount a user can receive per withdrawal, in whole USDC/USDT. */
export const RECEIVE_LIMITS = { min: 2, max: 500 } as const;

/** "10", "10.5", "10.123456": a positive amount with at most 6 decimals. */
const StableAmount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/, "Enter an amount like 10 or 10.50")
  .refine((v) => Number(v) >= RECEIVE_LIMITS.min, `The smallest withdrawal is ${RECEIVE_LIMITS.min}`)
  .refine((v) => Number(v) <= RECEIVE_LIMITS.max, `The largest withdrawal is ${RECEIVE_LIMITS.max} for now`);

export const QuoteBody = z.object({
  payWith: z.enum(PAY_WITH),
  chain: z.enum(CHAIN_IDS),
  asset: z.enum(ASSETS),
  /** Whole units, e.g. "10.50". */
  receive: StableAmount,
  destination: z.string().trim().min(1, "Paste an address").max(120),
});
export type QuoteBody = z.infer<typeof QuoteBody>;

export const WAITLIST_COUNTRIES = [
  { value: "NG", label: "Nigeria" },
  { value: "GH", label: "Ghana" },
  { value: "KE", label: "Kenya" },
  { value: "ZA", label: "South Africa" },
  { value: "other", label: "Somewhere else" },
] as const;
export const PAYOUT_METHODS = [
  { value: "bank", label: "Bank account" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "cash_agent", label: "Cash agent" },
] as const;
export const MONTHLY_AMOUNTS = [
  { value: "under_100", label: "Under $100" },
  { value: "100_500", label: "$100 – $500" },
  { value: "500_2000", label: "$500 – $2,000" },
  { value: "over_2000", label: "Over $2,000" },
] as const;

const values = <T extends readonly { value: string }[]>(list: T) =>
  list.map((o) => o.value) as [T[number]["value"], ...T[number]["value"][]];

export const WaitlistBody = z.object({
  country: z.enum(values(WAITLIST_COUNTRIES), { error: "Pick a country" }),
  method: z.enum(values(PAYOUT_METHODS), { error: "Pick how you'd like to be paid" }),
  monthly: z.enum(values(MONTHLY_AMOUNTS), { error: "Pick an amount" }),
});
export type WaitlistBody = z.infer<typeof WaitlistBody>;

/** What the Withdraw screen shows on the review step. Amounts in smallest units. */
export type QuoteView = {
  /** True until a real provider is connected: no money can move on a sample quote. */
  sample: boolean;
  providerName: string;
  payWith: (typeof PAY_WITH)[number];
  chain: (typeof CHAIN_IDS)[number];
  asset: (typeof ASSETS)[number];
  destination: string;
  receiveAmount: string;
  receiveMin: string;
  /** About what Nimiq Pay will take, in `payWith`. The exact amount is shown in Nimiq Pay. */
  sendEstimate: string;
  fees: { label: string; amount: string; asset: string }[];
  expiresAt: string; // ISO
  etaSeconds: number;
};
