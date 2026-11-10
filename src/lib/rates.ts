import "server-only";

// Live NIM / USDT prices in fiat from CoinGecko, cached briefly in memory.
const CACHE_MS = 60_000;
const IDS = { NIM: "nimiq-2", USDT: "tether" } as const;
type Prices = Record<string, Record<string, number>>;

const g = globalThis as unknown as { __nimbillRates?: { at: number; prices: Prices } };

async function fetchPrices(): Promise<Prices> {
  const cached = g.__nimbillRates;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.prices;
  const { CURRENCY_CODES } = await import("./currencies");
  const url =
    `https://api.coingecko.com/api/v3/simple/price?ids=${Object.values(IDS).join(",")}` +
    `&vs_currencies=${CURRENCY_CODES.map((c) => c.toLowerCase()).join(",")}`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
  try {
    const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const prices = (await res.json()) as Prices;
    if (!prices[IDS.NIM] || !prices[IDS.USDT]) throw new Error("CoinGecko returned no prices");
    g.__nimbillRates = { at: Date.now(), prices };
    return prices;
  } catch (e) {
    // Fall back to a slightly stale price (max 10 min) rather than failing the payment.
    if (cached && Date.now() - cached.at < 10 * 60_000) return cached.prices;
    throw e;
  }
}

/** Price of 1 NIM / 1 USDT in `currency`. */
export async function getRate(asset: "NIM" | "USDT", currency: string): Promise<number> {
  const prices = await fetchPrices();
  const rate = prices[IDS[asset]]?.[currency.toLowerCase()];
  if (!rate || !(rate > 0)) throw new Error(`No ${asset} price for ${currency}`);
  return rate;
}

export async function getAllRates(currency: string) {
  const [nim, usdt] = await Promise.all([getRate("NIM", currency), getRate("USDT", currency)]);
  return { NIM: nim, USDT: usdt };
}
