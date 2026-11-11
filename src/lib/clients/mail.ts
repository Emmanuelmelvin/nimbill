import "server-only";
import { z } from "zod";
import { env } from "../env";
import { Errors } from "../errors";
import { serviceHttp } from "./shared";

// Outgoing email through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
// This is the only file that knows how mail leaves the server: the rest of the app calls
// `mail.send()`. Moving to another email API means rewriting `send` below and nothing else.
//
// Without RESEND_API_KEY `mail.configured` is false and nothing is sent.
//
// No domain yet: Resend's shared sender (the default below) only delivers to the email address
// of the Resend account itself. Once a domain is verified in Resend, set MAIL_FROM to an address
// on it (e.g. "NimBill <billing@your-domain.com>") and mail reaches every merchant.

const DEFAULT_FROM = "NimBill <onboarding@resend.dev>";

const http = serviceHttp({
  service: "resend",
  baseUrl: env.RESEND_API_URL,
  timeoutMs: 10_000,
  retries: 0, // overridden per send, where an idempotency key makes a retry safe
  headers: (): Record<string, string> => ({ authorization: `Bearer ${env.RESEND_API_KEY}` }),
  mapError: ({ status, data }) => {
    // Resend explains refusals in `message` (e.g. the shared sender used for an outside address).
    const reason = (data as { message?: unknown } | null)?.message;
    return Errors.upstream("resend", `resend responded with HTTP ${status}`, {
      details: { status, ...(typeof reason === "string" ? { reason } : {}) },
    });
  },
});

const Sent = z.object({ id: z.string() });

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Same key = same email: the provider drops repeats, so a retry can never deliver twice. */
  idempotencyKey?: string;
};

export const mail = {
  /** False when no email provider is set up. Callers skip sending instead of treating it as an error. */
  configured: !!env.RESEND_API_KEY,

  async send({ idempotencyKey, to, ...message }: MailMessage): Promise<void> {
    if (!mail.configured) throw Errors.config("Email is not configured: set RESEND_API_KEY.");
    await http.post(
      "emails",
      { from: env.MAIL_FROM || DEFAULT_FROM, to: [to], ...message },
      {
        schema: Sent,
        ...(idempotencyKey ? { headers: { "idempotency-key": idempotencyKey }, retries: 1 } : {}),
      },
    );
  },
};
