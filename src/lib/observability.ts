import "server-only";
import * as Sentry from "@sentry/nextjs";
import type { AppError } from "./errors";
import { logger } from "./logger";

/** Business metrics (Sentry Metrics; no-ops without a DSN). Keep names stable: dashboards depend on them. */
export const metrics = {
  invoiceCreated: (currency: string) => Sentry.metrics.count("invoice.created", 1, { attributes: { currency } }),
  quoteCreated: (asset: "NIM" | "USDT") => Sentry.metrics.count("quote.created", 1, { attributes: { asset } }),
  invoicePaid: (asset: "NIM" | "USDT", via: "hash" | "recovery") => Sentry.metrics.count("invoice.paid", 1, { attributes: { asset, via } }),
  apiError: (code: string, status: number) => Sentry.metrics.count("api.error", 1, { attributes: { code, status: String(status) } }),
};

/**
 * Report a handled error. 4xx are expected (logged as warnings); 5xx are bugs or outages
 * (logged as errors and sent to Sentry as issues). Sentry calls are no-ops without a DSN.
 */
export function reportError(err: AppError, context: Record<string, unknown> = {}) {
  const entry = { code: err.code, status: err.status, service: err.service, ...context, details: err.details };
  metrics.apiError(err.code, err.status);
  if (err.status < 500) {
    logger.warn(err.message, entry); // expected: no stack trace needed
    return;
  }
  logger.error(err.message, { ...entry, cause: err.cause });
  Sentry.captureException(err.cause instanceof Error && err.code === "INTERNAL" ? err.cause : err, {
    tags: { code: err.code, ...(err.service ? { service: err.service } : {}) },
    extra: { ...context, details: err.details },
  });
}
