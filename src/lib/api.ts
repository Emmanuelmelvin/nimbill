import "server-only";
import { type AppError, toAppError } from "./errors";
import { reportError } from "./observability";

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
 */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      const err = toAppError(e);
      const req = args[0] instanceof Request ? args[0] : null;
      reportError(err, req ? { method: req.method, path: new URL(req.url).pathname } : {});
      return errorResponse(err);
    }
  };
}
