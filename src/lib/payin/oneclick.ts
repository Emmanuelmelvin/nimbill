import "server-only";
import { z } from "zod";
import { serviceHttp } from "../clients/shared";
import { env } from "../env";
import { AppError, Errors } from "../errors";
import { POLYGON_USDT_ASSET_ID, type PayinSource } from "./sources";

// NEAR Intents' 1Click API (https://docs.near-intents.org/integration/distribution-channels/1click-api).
//
// How a payment moves, and why NimBill never holds it:
//   1. NimBill asks for an EXACT_OUTPUT quote: exactly `amount` USDT must reach the merchant's
//      Polygon address. 1Click answers with a one-time deposit address on the client's chain and
//      how much to send there (its fees are on the client's side).
//   2. The client sends to that deposit address from any wallet or exchange.
//   3. 1Click swaps it and sends the USDT to the merchant. If the deposit is too small, or arrives
//      after the deadline, it goes back to the client's refund address instead.
// NimBill only makes these API calls and reads the result on Polygon before marking the invoice paid.

const http = serviceHttp({
  service: "oneclick",
  baseUrl: env.ONECLICK_API_URL,
  timeoutMs: 20_000,
  headers: (): Record<string, string> => (env.ONECLICK_API_KEY ? { "X-API-Key": env.ONECLICK_API_KEY } : {}),
  // 1Click explains a refused quote in `message` ("Temporary swap limits: minimum swap amount is $100").
  mapError: ({ status, data }) => {
    const message = typeof (data as { message?: unknown })?.message === "string" ? (data as { message: string }).message : "";
    if (status === 404) return Errors.notFound("1Click doesn't know this deposit address.");
    if (status === 400) return Errors.badRequest(readableRefusal(message), { details: { oneclick: message.slice(0, 300) } });
    return Errors.upstream("oneclick", `1Click responded with HTTP ${status}`, { details: { status, message: message.slice(0, 300) } });
  },
});

/** Turn 1Click's reason for refusing a quote into something the client can act on. */
export function readableRefusal(message: string): string {
  const min = /minimum swap amount is \$?([\d.,]+)/i.exec(message);
  if (min) return `Paying from another chain needs at least $${min[1]} right now. For a smaller amount, pay with Nimiq Pay.`;
  if (/amount is too low|too small/i.test(message))
    return "This amount is too small to pay from another chain. Pay with Nimiq Pay instead.";
  if (/refundTo|refund/i.test(message)) return "That refund address was not accepted. Check it is on the chain you pay from.";
  return "This payment option can't take this payment right now. Try another coin, or pay with Nimiq Pay.";
}

const Quote = z.object({
  depositAddress: z.string().min(1),
  depositMemo: z.string().optional().nullable(),
  amountIn: z.string(),
  minAmountIn: z.string().optional(),
  amountOut: z.string(),
  deadline: z.string(),
  timeEstimate: z.number().optional(),
});
const QuoteResponse = z.object({ quote: Quote, signature: z.string().optional(), correlationId: z.string().optional() });
export type OneClickQuote = z.infer<typeof Quote> & { correlationId?: string; signature?: string };

const TxRef = z.object({ hash: z.string(), explorerUrl: z.string().optional() });
const Status = z.object({
  status: z.enum(["KNOWN_DEPOSIT_TX", "PENDING_DEPOSIT", "INCOMPLETE_DEPOSIT", "PROCESSING", "SUCCESS", "REFUNDED", "FAILED"]),
  updatedAt: z.string().optional(),
  swapDetails: z
    .object({
      amountOut: z.string().optional().nullable(),
      depositedAmount: z.string().optional().nullable(),
      refundedAmount: z.string().optional().nullable(),
      refundReason: z.string().optional().nullable(),
      originChainTxHashes: z.array(TxRef).default([]),
      destinationChainTxHashes: z.array(TxRef).default([]),
    })
    .partial()
    .default({}),
});
export type OneClickStatus = z.infer<typeof Status>;

export const oneclick = {
  /** A live quote with a deposit address: `receiveUnits` (6-decimal USDT) reaches `recipient` on Polygon. */
  async quote(opts: {
    source: PayinSource;
    receiveUnits: string;
    recipient: string;
    refundTo: string;
    deadline: Date;
  }): Promise<OneClickQuote> {
    const r = await http.post(
      "v0/quote",
      {
        dry: false,
        swapType: "EXACT_OUTPUT",
        // The buffer on the client's side: small for dollar coins, bigger for coins whose price moves.
        slippageTolerance: opts.source.slippageBps,
        originAsset: opts.source.assetId,
        depositType: "ORIGIN_CHAIN",
        destinationAsset: POLYGON_USDT_ASSET_ID,
        amount: opts.receiveUnits,
        refundTo: opts.refundTo,
        refundType: "ORIGIN_CHAIN",
        recipient: opts.recipient,
        recipientType: "DESTINATION_CHAIN",
        deadline: opts.deadline.toISOString(),
        referral: "nimbill",
        quoteWaitingTimeMs: 3000,
      },
      { schema: QuoteResponse },
    );
    return { ...r.quote, correlationId: r.correlationId, signature: r.signature };
  },

  /** Where the payment sent to `depositAddress` stands. Null when 1Click doesn't know it (yet). */
  async status(depositAddress: string, depositMemo?: string | null): Promise<OneClickStatus | null> {
    try {
      return await http.get("v0/status", {
        query: { depositAddress, depositMemo: depositMemo || undefined },
        schema: Status,
        retries: 1,
      });
    } catch (e) {
      if (AppError.is(e) && (e.code === "NOT_FOUND" || e.code === "BAD_REQUEST")) return null;
      throw e;
    }
  },
};
