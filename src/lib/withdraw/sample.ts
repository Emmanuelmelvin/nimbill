import "server-only";
import { LUNA_PER_NIM } from "../currencies";
import { getAllRates } from "../rates";
import type { ChainId } from "./chains";
import type { QuoteBody, QuoteView } from "./schemas";

// A made-up quote, so the Withdraw screen can be clicked through end to end before a provider is
// connected. Prices are live; the fees and timings are placeholders. It is marked `sample: true`,
// and the screen then never asks Nimiq Pay to pay anything.

const UNITS = 1_000_000; // USDC / USDT: 6 decimals
const SAMPLE_PROVIDER_FEE = 0.004; // 0.4 %
const SAMPLE_NETWORK_FEE: Partial<Record<ChainId, number>> = { polygon: 0.01, arbitrum: 0.02, ethereum: 0.5 };
/** Room for Nimiq Pay's own NIM → Lightning fee, which NimBill can't know in advance. */
const NIMIQ_PAY_ALLOWANCE = 0.01;
const QUOTE_TTL_MS = 3 * 60_000;

export async function sampleQuote(body: QuoteBody, destination: string): Promise<QuoteView> {
  const receive = Math.round(Number(body.receive) * UNITS);
  const providerFee = Math.round(receive * SAMPLE_PROVIDER_FEE);
  const networkFee = Math.round((SAMPLE_NETWORK_FEE[body.chain] ?? 0.05) * UNITS);
  const rates = await getAllRates("USD"); // USD per NIM and per USDT; USDC is taken as $1
  const usd = ((receive + providerFee + networkFee) / UNITS) * (1 + NIMIQ_PAY_ALLOWANCE);
  const sendEstimate = body.payWith === "NIM" ? Math.ceil((usd / rates.NIM) * LUNA_PER_NIM) : Math.ceil((usd / rates.USDT) * UNITS);
  return {
    sample: true,
    providerName: "Lendaswap",
    payWith: body.payWith,
    chain: body.chain,
    asset: body.asset,
    destination,
    receiveAmount: String(receive),
    receiveMin: String(Math.floor(receive * 0.995)),
    sendEstimate: String(sendEstimate),
    fees: [
      { label: "Provider fee", amount: String(providerFee), asset: body.asset },
      { label: "Network fee", amount: String(networkFee), asset: body.asset },
    ],
    expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
    etaSeconds: 120,
  };
}
