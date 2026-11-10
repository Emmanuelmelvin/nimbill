// One error type for the whole project, on the server and in the browser.
// Throw an AppError (usually through the `Errors` helpers) instead of a plain Error. The API error
// catcher (`handle` in lib/api.ts) turns it into `{ error: { code, message } }` with the right status,
// and the browser API client turns that response back into an AppError.
import { ZodError } from "zod";

export type ErrorCode =
  | "BAD_REQUEST" // the request makes no sense for the current state (e.g. invoice already paid)
  | "VALIDATION" // input failed a schema check
  | "UNAUTHORIZED" // not signed in / signature invalid
  | "FORBIDDEN" // signed in, but not allowed
  | "NOT_FOUND"
  | "CONFLICT" // e.g. a transaction already used for another invoice
  | "RATE_LIMITED"
  | "UPSTREAM" // an external service (RPC, CoinGecko…) failed or answered nonsense
  | "NETWORK" // browser: our own API is unreachable (offline)
  | "WALLET" // browser: the wallet refused or can't do something
  | "CONFIG" // server misconfiguration (missing env var…)
  | "INTERNAL"; // a bug

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UPSTREAM: 503,
  NETWORK: 0,
  WALLET: 400,
  CONFIG: 500,
  INTERNAL: 500,
};

/** What users see when the real message must stay internal. */
export const GENERIC_MESSAGES: Partial<Record<ErrorCode, string>> = {
  UPSTREAM: "A network service is not responding. Please try again in a moment.",
  CONFIG: "Something went wrong. Please try again.",
  INTERNAL: "Something went wrong. Please try again.",
};

export type AppErrorOptions = {
  status?: number;
  /** Safe to show `message` to users? Defaults to true for 4xx codes, false for 5xx. */
  expose?: boolean;
  cause?: unknown;
  /** Extra context for logs and Sentry. Never sent to the browser. */
  details?: Record<string, unknown>;
  /** For UPSTREAM errors: which external service failed. */
  service?: string;
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly expose: boolean;
  readonly details?: Record<string, unknown>;
  readonly service?: string;

  constructor(code: ErrorCode, message: string, opts: AppErrorOptions = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.status = opts.status ?? DEFAULT_STATUS[code];
    this.expose = opts.expose ?? (this.status > 0 && this.status < 500);
    this.details = opts.details;
    this.service = opts.service;
  }

  /** Message that is safe to show to users. */
  get publicMessage(): string {
    return this.expose ? this.message : (GENERIC_MESSAGES[this.code] ?? "Something went wrong. Please try again.");
  }

  /** Response body for the API. */
  toJSON(): { code: ErrorCode; message: string } {
    return { code: this.code, message: this.publicMessage };
  }

  static is(e: unknown): e is AppError {
    return e instanceof AppError;
  }
}

/** Shorthands for the common cases. */
export const Errors = {
  badRequest: (message: string, opts?: AppErrorOptions) => new AppError("BAD_REQUEST", message, opts),
  validation: (message: string, opts?: AppErrorOptions) => new AppError("VALIDATION", message, opts),
  unauthorized: (message = "Please sign in first.", opts?: AppErrorOptions) => new AppError("UNAUTHORIZED", message, opts),
  forbidden: (message = "You can't do that.", opts?: AppErrorOptions) => new AppError("FORBIDDEN", message, opts),
  notFound: (message = "Not found.", opts?: AppErrorOptions) => new AppError("NOT_FOUND", message, opts),
  conflict: (message: string, opts?: AppErrorOptions) => new AppError("CONFLICT", message, opts),
  rateLimited: (message: string, opts?: AppErrorOptions) => new AppError("RATE_LIMITED", message, opts),
  upstream: (service: string, message: string, opts?: AppErrorOptions) => new AppError("UPSTREAM", message, { ...opts, service }),
  network: (message = "You seem to be offline. Check your connection and try again.", opts?: AppErrorOptions) =>
    new AppError("NETWORK", message, { expose: true, ...opts }),
  wallet: (message: string, opts?: AppErrorOptions) => new AppError("WALLET", message, opts),
  config: (message: string, opts?: AppErrorOptions) => new AppError("CONFIG", message, opts),
  internal: (cause: unknown, message = "Unexpected error") => new AppError("INTERNAL", message, { cause }),
};

/** Normalise anything that was thrown into an AppError. */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof ZodError) {
    const issue = e.issues[0];
    return Errors.validation(issue?.message || "Invalid input", { cause: e, details: { issues: e.issues.slice(0, 5) } });
  }
  if (e instanceof SyntaxError) return Errors.validation("The request body is not valid JSON.", { cause: e });
  return Errors.internal(e, e instanceof Error ? e.message : String(e));
}
