"use client";
// Browser client for NimBill's own API. Errors come back from the server as
// `{ error: { code, message } }` and are turned back into AppErrors here.
import type { BookClient } from "@/lib/clients-book";
import type { Merchant } from "@/lib/db/schema";
import { AppError, Errors, type ErrorCode } from "@/lib/errors";
import { createHttpClient } from "@/lib/http";
import type { PublicInvoice } from "@/lib/invoices";

export type { BookClient, PublicInvoice };
// `email` is the signed-in merchant's own address (settings only); it is never part of PublicInvoice.
export type MerchantInfo = Pick<
  Merchant,
  "address" | "name" | "evmAddress" | "email" | "displayCurrency" | "tag" | "tagChangedAt" | "bio" | "boardOpenAmounts"
>;

const CODES = new Set<ErrorCode>([
  "BAD_REQUEST",
  "VALIDATION",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "UPSTREAM",
  "CONFIG",
  "INTERNAL",
]);

const http = createHttpClient({
  service: "nimbill-api",
  timeoutMs: 30_000,
  retries: 0, // the UI decides when to retry (e.g. payment polling)
  credentials: "same-origin",
  mapError: ({ status, data }) => {
    const e = (data as { error?: { code?: string; message?: string } } | null)?.error;
    const code = e?.code && CODES.has(e.code as ErrorCode) ? (e.code as ErrorCode) : status >= 500 ? "INTERNAL" : "BAD_REQUEST";
    // The server already decided what is safe to show.
    return new AppError(code, e?.message || `Request failed (${status})`, { status, expose: true });
  },
  onNetworkError: (cause) => Errors.network(undefined, { cause }),
});

export async function api<T>(path: string, init?: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown }): Promise<T> {
  return http.request<T>(path, { method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"), body: init?.body });
}
