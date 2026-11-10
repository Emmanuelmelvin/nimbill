import "server-only";
import { ZodError } from "zod";
import { UserError } from "./invoices";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function fail(message: string, status = 400) {
  return json({ error: message }, status);
}

/** Wrap a route handler so errors become friendly JSON instead of a 500 page. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof UserError) return fail(e.message, 400);
      if (e instanceof ZodError) return fail(e.issues[0]?.message || "Invalid input", 400);
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      const network = /fetch failed|timeout|aborted|RPC|CoinGecko|Validators/i.test(msg);
      return fail(network ? "A network service is not responding. Please try again in a moment." : "Something went wrong. Please try again.", network ? 503 : 500);
    }
  };
}
