import "server-only";
import { z } from "zod";
import { env } from "../env";
import { Errors } from "../errors";
import { logger } from "../logger";
import { serviceHttp } from "./shared";

// Nimiq validators API (staking pools), with mirrors as fallbacks and a 10-minute cache.

const SERVICE = "validators-api";
const http = serviceHttp({ service: SERVICE, timeoutMs: 10_000, retries: 1 });
const SOURCES = [env.VALIDATORS_API_URL, "https://validators-api-mainnet.nuxt.dev/api/v1/validators", "https://validators-api-mainnet.pages.dev/api/v1/validators"].filter(
  (u): u is string => !!u,
);
const CACHE_MS = 10 * 60_000;

const RawValidator = z
  .object({
    name: z.string(),
    address: z.string(),
    fee: z.number().nullable(),
    payoutType: z.string(),
    isListed: z.boolean(),
    score: z.object({ total: z.number().nullish() }).loose().nullish(),
    logo: z.string().nullish(),
  })
  .loose();

export type Validator = { name: string; address: string; fee: number; payoutType: string; score: number; logo?: string };

const g = globalThis as unknown as { __nimbillValidators?: { at: number; list: Validator[] } };

export const validators = {
  /** Top staking pools (they pay rewards out; solo validators keep them), best score first. */
  async list(): Promise<Validator[]> {
    const cached = g.__nimbillValidators;
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.list;
    for (const url of SOURCES) {
      try {
        const raw = await http.get(url, { schema: z.array(RawValidator) });
        const list = raw
          .filter((v) => v.isListed && (v.payoutType === "restake" || v.payoutType === "direct"))
          .map((v) => ({ name: v.name, address: v.address, fee: v.fee ?? 0, payoutType: v.payoutType, score: v.score?.total ?? 0, logo: v.logo ?? undefined }))
          .sort((a, b) => b.score - a.score || a.fee - b.fee)
          .slice(0, 6);
        g.__nimbillValidators = { at: Date.now(), list };
        return list;
      } catch (e) {
        logger.warn("validators source failed, trying next", { url, error: (e as Error).message });
      }
    }
    if (cached) return cached.list;
    throw Errors.upstream(SERVICE, "Validator list is unavailable right now.", { expose: true });
  },
};
