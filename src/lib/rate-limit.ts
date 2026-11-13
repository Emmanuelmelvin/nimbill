import "server-only";
import { Errors } from "./errors";

// Fixed-window request limits for anonymous endpoints that cost an RPC call or curve maths.
// In memory, so each server instance counts on its own: a cheap guard against one client
// hammering an endpoint, not a global quota. Put a shared store (e.g. Redis) behind this for that.

const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 50_000;

/** The caller's IP from the proxy headers, or "unknown". */
export function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
}

/** Throws RATE_LIMITED once `key` has made more than `max` calls within `windowMs`. */
export function rateLimit(key: string, max: number, windowMs: number): void {
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
  if (b.count > max) throw Errors.rateLimited("Too many requests. Please wait a minute and try again.");
}
