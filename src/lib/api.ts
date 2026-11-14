import "server-only";
import { type AppError, toAppError } from "./errors";
import { reportError } from "./observability";
import { currentRateLimit, rateLimitHeaders, withRateLimitScope } from "./rate-limit";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

/** `{ error: { code, message } }` with the error's HTTP status. Internal details never leave the server. */
export function errorResponse(err: AppError) {
  return json({ error: err.toJSON() }, err.status);
}

/**
 * Global error catcher for API routes. Every route handler is wrapped in this: anything thrown
 * inside (AppError, ZodError, bad JSON, bugs) is reported and turned into a clean JSON error.
 * It also puts the RateLimit-* headers on the answer when the request checked a limit (lib/rate-limit.ts).
 */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return (...args: A) =>
    withRateLimitScope(async () => {
      let res: Response;
      try {
        res = await fn(...args);
      } catch (e) {
        const err = toAppError(e);
        const req = args[0] instanceof Request ? args[0] : null;
        reportError(err, req ? { method: req.method, path: new URL(req.url).pathname } : {});
        res = errorResponse(err);
      }
      const info = currentRateLimit();
      if (info) for (const [k, v] of Object.entries(rateLimitHeaders(info, res.status === 429))) res.headers.set(k, v);
      return res;
    });
}
