import "server-only";
import { z } from "zod";
import { env } from "../env";
import { serviceHttp } from "./shared";

// CoinGecko price API (free "demo" tier; an API key raises the rate limit).

const http = serviceHttp({
  service: "coingecko",
  baseUrl: "https://api.coingecko.com/api/v3",
  timeoutMs: 8_000,
  retries: 1,
  headers: (): Record<string, string> => (env.COINGECKO_API_KEY ? { "x-cg-demo-api-key": env.COINGECKO_API_KEY } : {}),
});

/** `{ [coinId]: { [vsCurrency]: price } }` */
const SimplePrice = z.record(z.string(), z.record(z.string(), z.number()));
export type SimplePrice = z.infer<typeof SimplePrice>;

export const coingecko = {
  simplePrice(ids: string[], vsCurrencies: string[]): Promise<SimplePrice> {
    return http.get("simple/price", { query: { ids: ids.join(","), vs_currencies: vsCurrencies.join(",") }, schema: SimplePrice });
  },
};
