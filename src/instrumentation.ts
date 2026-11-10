// Next.js server startup hook. Starts Sentry for the current runtime, and `onRequestError` is the
// global catcher for errors thrown anywhere on the server (rendering, route handlers, metadata,
// OG images) that weren't already handled by the API error catcher in lib/api.ts.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("../sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("../sentry.edge.config");
}

export const onRequestError = Sentry.captureRequestError;
