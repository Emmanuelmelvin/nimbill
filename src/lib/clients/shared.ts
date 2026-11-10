import "server-only";
import { createHttpClient, type HttpClientConfig } from "../http";
import { logger } from "../logger";

/** An HTTP client for an external service, with request/retry/error logging wired in. */
export function serviceHttp(cfg: Omit<HttpClientConfig, "hooks">) {
  return createHttpClient({
    ...cfg,
    hooks: {
      onResponse: (e) => logger.debug("http ok", e),
      onRetry: ({ error, ...e }) => logger.warn("http retry", { ...e, error: error.message }),
      onError: ({ error, ...e }) => logger.warn("http failed", { ...e, error: error.message, code: error.code }),
    },
  });
}
