import "server-only";
import { coingecko, type SimplePrice } from "./clients/coingecko";
import { CURRENCY_CODES } from "./currencies";
import { Errors } from "./errors";
import { logger } from "./logger";
import type { Fx } from "./money";

// Live NIM / USDT prices in fiat from CoinGecko, cached briefly in memory.
const CACHE_MS = 60_000;
const STALE_OK_MS = 10 * 60_000;
const IDS = { NIM: "nimiq-2", USDT: "tether" } as const;

const g = globalThis as unknown as { __nimbillRates?: { at: number; prices: SimplePrice } };

async function fetchPrices(): Promise<SimplePrice> {
  const cached = g.__nimbillRates;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.prices;
  try {
    const prices = await coingecko.simplePrice(
      Object.values(IDS),
      CURRENCY_CODES.map((c) => c.toLowerCase()),
    );
    if (!prices[IDS.NIM] || !prices[IDS.USDT]) throw Errors.upstream("coingecko", "CoinGecko returned no NIM/USDT prices");
    g.__nimbillRates = { at: Date.now(), prices };
    return prices;
  } catch (e) {
    // Fall back to a slightly stale price rather than failing the payment.
    if (cached && Date.now() - cached.at < STALE_OK_MS) {
      logger.warn("using stale prices", { ageMs: Date.now() - cached.at, error: (e as Error).message });
      return cached.prices;
    }
    throw e;
  }
}

/** Price of 1 NIM / 1 USDT in `currency`. */
export async function getRate(asset: "NIM" | "USDT", currency: string): Promise<number> {
  const prices = await fetchPrices();
  const rate = prices[IDS[asset]]?.[currency.toLowerCase()];
  if (!rate || !(rate > 0)) throw Errors.upstream("coingecko", `No ${asset} price for ${currency}`);
  return rate;
}

export async function getAllRates(currency: string) {
  const [nim, usdt] = await Promise.all([getRate("NIM", currency), getRate("USDT", currency)]);
  return { NIM: nim, USDT: usdt };
}

/** Rates for turning a dollar value into NIM, USDT or any supported fiat (see lib/money.ts). */
export async function getFx(): Promise<Fx> {
  const prices = await fetchPrices();
  const nim = prices[IDS.NIM];
  const usdt = prices[IDS.USDT];
  if (!(nim?.usd > 0) || !(usdt?.usd > 0)) throw Errors.upstream("coingecko", "No USD prices for NIM/USDT");
  const perUsd: Record<string, number> = {};
  for (const c of CURRENCY_CODES) {
    const v = usdt[c.toLowerCase()];
    if (v > 0) perUsd[c] = v / usdt.usd;
  }
  return { nimUsd: nim.usd, usdtUsd: usdt.usd, perUsd };
}

/** Like getFx, but null instead of throwing: totals are nice to have, never worth failing a page for. */
export async function tryGetFx(): Promise<Fx | null> {
  try {
    return await getFx();
  } catch (e) {
    logger.warn("fx unavailable", { error: (e as Error).message });
    return null;
  }
}
