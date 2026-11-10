"use client";
// Browser-side logging. Winston only runs on the server, so the browser logs to the console in
// development and reports errors to Sentry (when configured) everywhere.
import * as Sentry from "@sentry/nextjs";
import { AppError } from "@/lib/errors";

const dev = process.env.NODE_ENV !== "production";

/** Report an unexpected error. Expected ones (user cancelled, validation…) should not come here. */
export function reportClientError(error: unknown, context: Record<string, unknown> = {}) {
  if (dev) console.error("[nimbill]", error, context);
  const tags = AppError.is(error) ? { code: error.code, service: error.service } : undefined;
  Sentry.captureException(error, { tags, extra: context });
}

export const clientLog = {
  info(message: string, data?: Record<string, unknown>) {
    if (dev) console.info("[nimbill]", message, data ?? "");
    Sentry.logger?.info(message, data);
  },
  warn(message: string, data?: Record<string, unknown>) {
    if (dev) console.warn("[nimbill]", message, data ?? "");
    Sentry.logger?.warn(message, data);
  },
};
