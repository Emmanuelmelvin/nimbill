import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { Errors } from "./errors";

// Request limits, and the headers that tell callers where they stand:
//
//   RateLimit-Limit: 30        requests allowed in the window
//   RateLimit-Remaining: 12    left in it after this request
//   RateLimit-Reset: 412       seconds until the window frees up
//   Retry-After: 412           only on 429 answers
//
// Every limit checked while handling a request is noted (noteRateLimit); `handle` in lib/api.ts
// puts the tightest one on the response, errors included. So a library function such as
// createBoardInvoice can apply a limit without knowing about responses.
//
// rateLimit() below is in memory, so each server instance counts on its own: a cheap guard against
// one client hammering an endpoint, not a global quota. Put a shared store (e.g. Redis) behind it for that.

export type RateLimitInfo = { limit: number; remaining: number; resetAt: number };

const scope = new AsyncLocalStorage<{ info?: RateLimitInfo }>();

/** Run `fn` with its own record of the limits it checks (used by `handle`). */
export function withRateLimitScope<T>(fn: () => Promise<T>): Promise<T> {
  return scope.run({}, fn);
}

/** Record a limit checked for this request. The one with the fewest requests left is what the caller sees. */
export function noteRateLimit(info: RateLimitInfo): void {
  const s = scope.getStore();
  if (!s) return;
  const cur = s.info;
  if (!cur || info.remaining < cur.remaining || (info.remaining === cur.remaining && info.resetAt > cur.resetAt)) s.info = info;
}

/** The limit this request ran into, if any. */
export const currentRateLimit = (): RateLimitInfo | undefined => scope.getStore()?.info;

export function rateLimitHeaders(info: RateLimitInfo, limited: boolean, now = Date.now()): Record<string, string> {
  const reset = String(Math.max(1, Math.ceil((info.resetAt - now) / 1000)));
  return {
    "ratelimit-limit": String(info.limit),
    "ratelimit-remaining": String(Math.max(0, info.remaining)),
    "ratelimit-reset": reset,
    ...(limited ? { "retry-after": reset } : {}),
  };
}

/** Header names browsers on other sites may read (see lib/cors.ts). */
export const RATE_LIMIT_HEADERS = ["ratelimit-limit", "ratelimit-remaining", "ratelimit-reset", "retry-after"];

/**
 * A limit counted elsewhere (e.g. rows in the database): `used` requests so far in the window,
 * this one not included. Notes the numbers and throws RATE_LIMITED when this one doesn't fit.
 */
export function enforceLimit(opts: { used: number; limit: number; resetAt: number; message: string }): void {
  const remaining = opts.limit - opts.used - 1;
  noteRateLimit({ limit: opts.limit, remaining, resetAt: opts.resetAt });
  if (remaining < 0) throw Errors.rateLimited(opts.message);
}

const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 50_000;

/** The caller's IP from the proxy headers, or "unknown". */
export function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
}

/** Throws RATE_LIMITED once `key` has made more than `max` calls within `windowMs`. */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
  message = "Too many requests. Please wait a minute and try again.",
): void {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
      if (buckets.size >= MAX_KEYS) buckets.clear();
    }
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  noteRateLimit({ limit: max, remaining: max - b.count, resetAt: b.resetAt });
  if (b.count > max) throw Errors.rateLimited(message);
}
