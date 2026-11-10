// The one HTTP client for the project, a thin layer over fetch (works on the server and in the
// browser). Every external service and our own API client is built on it, so they all share:
// timeouts, retries with backoff, JSON in/out, zod validation of responses, AppError errors,
// and logging hooks.
import type { z } from "zod";
import { AppError, Errors } from "./errors";

type Query = Record<string, string | number | boolean | null | undefined>;
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type HttpEvent = { service: string; method: Method; url: string; status?: number; ms: number; attempt: number };

export type HttpClientConfig = {
  /** Name used in errors and logs, e.g. "coingecko". */
  service: string;
  baseUrl?: string;
  /** Per-attempt timeout. Default 10 s. */
  timeoutMs?: number;
  /** Extra attempts after a network error, timeout, 429 or 5xx. Default: 2 for GET, 0 otherwise. */
  retries?: number;
  headers?: Record<string, string> | (() => Record<string, string>);
  credentials?: RequestCredentials;
  hooks?: {
    onResponse?: (e: HttpEvent) => void;
    onRetry?: (e: HttpEvent & { error: AppError }) => void;
    onError?: (e: HttpEvent & { error: AppError }) => void;
  };
  /** Turn a non-2xx response into an AppError. Default: UPSTREAM error for `service`. */
  mapError?: (res: { status: number; data: unknown }) => AppError;
  /** Turn a network failure / timeout into an AppError. Default: UPSTREAM error for `service`. */
  onNetworkError?: (cause: unknown) => AppError;
};

export type RequestOptions<T> = {
  method?: Method;
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
  /** Validate the response; the parsed value is returned. Without it the JSON is returned as is. */
  schema?: z.ZodType<T>;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
};

const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt: number) => Math.min(2000, 250 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 100);

function buildUrl(baseUrl: string | undefined, path: string, query?: Query): string {
  const url = new URL(path, baseUrl ? (baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`) : globalThis.location?.origin);
  if (baseUrl && path === "") url.href = baseUrl;
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  return url.toString();
}

/** URL without the query string, for logs (queries can carry keys or long lists). */
const forLog = (url: string) => url.split("?")[0];

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  if ((res.headers.get("content-type") || "").includes("json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

function withTimeout(ms: number, outer?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return outer ? AbortSignal.any([outer, timeout]) : timeout;
}

export type HttpClient = ReturnType<typeof createHttpClient>;

export function createHttpClient(cfg: HttpClientConfig) {
  async function request<T = unknown>(path: string, o: RequestOptions<T> = {}): Promise<T> {
    const method: Method = o.method ?? (o.body !== undefined ? "POST" : "GET");
    const url = buildUrl(cfg.baseUrl, path, o.query);
    const retries = o.retries ?? cfg.retries ?? (method === "GET" ? 2 : 0);
    const baseHeaders = typeof cfg.headers === "function" ? cfg.headers() : (cfg.headers ?? {});
    const headers: Record<string, string> = {
      accept: "application/json",
      ...(o.body !== undefined ? { "content-type": "application/json" } : {}),
      ...baseHeaders,
      ...o.headers,
    };

    for (let attempt = 0; ; attempt++) {
      const started = Date.now();
      const event = (status?: number): HttpEvent => ({
        service: cfg.service,
        method,
        url: forLog(url),
        status,
        ms: Date.now() - started,
        attempt,
      });
      let error: AppError;
      let retryable: boolean;
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
          cache: "no-store",
          credentials: cfg.credentials,
          signal: withTimeout(o.timeoutMs ?? cfg.timeoutMs ?? 10_000, o.signal),
        });
        const data = await readBody(res);
        if (res.ok) {
          cfg.hooks?.onResponse?.(event(res.status));
          if (!o.schema) return data as T;
          const parsed = o.schema.safeParse(data);
          if (parsed.success) return parsed.data;
          // A malformed answer won't get better on retry.
          error = Errors.upstream(cfg.service, `${cfg.service} returned an unexpected response`, {
            cause: parsed.error,
            details: { url: forLog(url), issues: parsed.error.issues.slice(0, 3) },
          });
          retryable = false;
        } else {
          error = cfg.mapError
            ? cfg.mapError({ status: res.status, data })
            : Errors.upstream(cfg.service, `${cfg.service} responded with HTTP ${res.status}`, {
                details: { url: forLog(url), status: res.status },
              });
          retryable = RETRY_STATUS.has(res.status);
        }
      } catch (e) {
        if (o.signal?.aborted) throw e; // cancelled by the caller
        if (AppError.is(e)) throw e;
        const timedOut = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
        error = cfg.onNetworkError
          ? cfg.onNetworkError(e)
          : Errors.upstream(cfg.service, `${cfg.service} is unreachable${timedOut ? " (timed out)" : ""}`, {
              cause: e,
              details: { url: forLog(url) },
            });
        retryable = true;
      }

      if (retryable && attempt < retries) {
        cfg.hooks?.onRetry?.({ ...event(error.details?.status as number | undefined), error });
        await sleep(backoff(attempt + 1));
        continue;
      }
      cfg.hooks?.onError?.({ ...event(error.details?.status as number | undefined), error });
      throw error;
    }
  }

  return {
    request,
    get: <T = unknown>(path: string, o: Omit<RequestOptions<T>, "method" | "body"> = {}) => request<T>(path, { ...o, method: "GET" }),
    post: <T = unknown>(path: string, body?: unknown, o: Omit<RequestOptions<T>, "method" | "body"> = {}) =>
      request<T>(path, { ...o, method: "POST", body }),
    delete: <T = unknown>(path: string, o: Omit<RequestOptions<T>, "method"> = {}) => request<T>(path, { ...o, method: "DELETE" }),
  };
}
