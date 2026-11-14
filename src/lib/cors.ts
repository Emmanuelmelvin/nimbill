import "server-only";
import { RATE_LIMIT_HEADERS } from "./rate-limit";
import { SIGNATURE_HEADER } from "./webhook-signature";

// CORS for the public API, so agents and pages running in a browser on another site can call it.
//
// Only routes that need no sign-in use this, and only for their public methods (an invoice can be
// read from anywhere, but only cancelled by its owner from NimBill itself). Origin is "*" and
// credentials are never allowed, so a request from another site never carries the visitor's
// NimBill session: it is always treated as anonymous.

type Method = "GET" | "POST";

function corsHeaders(methods: Method[]): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": [...methods, "OPTIONS"].join(", "),
    // NimBill-Signature: stores sign the invoices they create (normally from their server, where
    // CORS doesn't apply, but a signed request from a browser shouldn't fail on the pre-check).
    "access-control-allow-headers": `content-type, ${SIGNATURE_HEADER}`,
    // Let scripts on other sites read how many requests they have left.
    "access-control-expose-headers": RATE_LIMIT_HEADERS.join(", "),
  };
}

/** Adds the CORS headers to whatever the handler returns, errors included. */
export function withCors<A extends unknown[]>(methods: Method[], fn: (...args: A) => Promise<Response> | Response) {
  return async (...args: A) => {
    const res = await fn(...args);
    for (const [k, v] of Object.entries(corsHeaders(methods))) res.headers.set(k, v);
    return res;
  };
}

/** The OPTIONS handler: answers the browser's pre-check before a cross-site POST with JSON. */
export function corsPreflight(methods: Method[]) {
  return () => new Response(null, { status: 204, headers: { ...corsHeaders(methods), "access-control-max-age": "86400" } });
}
