import "server-only";
import { z } from "zod";
import { Errors } from "./errors";

// Every server environment variable, checked once with zod. Import `env` instead of reading
// process.env directly, so a typo or bad value fails loudly at startup with a clear message.
// Production-only requirements (SESSION_SECRET, DATABASE_URL on Vercel) are checked where they
// are used, so `next build` still works on a machine without production secrets.

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema.optional());
const withDefault = <T extends z.ZodType>(schema: T, fallback: z.input<T>) =>
  z.preprocess(blankToUndefined, schema.default(fallback as never));

const Schema = z.object({
  NODE_ENV: withDefault(z.enum(["development", "production", "test"]), "development"),
  LOG_LEVEL: optional(z.enum(["error", "warn", "info", "http", "verbose", "debug", "silly"])),

  // Security / storage
  SESSION_SECRET: optional(z.string().min(32, "SESSION_SECRET must be at least 32 characters")),
  // Derives the server's half of every cheque key. Kept apart from SESSION_SECRET so rotating
  // sessions never locks funded cheques. Never rotate or lose it while cheques are open.
  CHEQUE_KEY_SECRET: optional(z.string().min(32, "CHEQUE_KEY_SECRET must be at least 32 characters")),
  // Encrypts every store's webhook secret at rest ("Pay with NimBill", lib/webhooks.ts). Losing or
  // changing it makes the saved secrets unreadable: each store would need a new one.
  WEBHOOK_KEY_SECRET: optional(z.string().min(32, "WEBHOOK_KEY_SECRET must be at least 32 characters")),
  DATABASE_URL: optional(z.url("DATABASE_URL must be a postgres connection URL")),

  // Withdrawals (lib/withdraw). Off unless WITHDRAW_LIVE is "true": the Withdraw screen then shows
  // sample quotes and no money can move. WITHDRAW_MNEMONIC is the 12/24-word recovery phrase every
  // swap's secret and claim key come from (`bun run withdraw:new-phrase` makes one). Set the SAME
  // phrase on the web app and the worker, back it up offline, and never change or lose it while a
  // withdrawal is in progress, or that withdrawal can't be claimed.
  WITHDRAW_LIVE: withDefault(z.enum(["true", "false"]), "false"),
  WITHDRAW_MNEMONIC: optional(
    z
      .string()
      .trim()
      .refine((m) => [12, 24].includes(m.split(/\s+/).length), "WITHDRAW_MNEMONIC must be a 12- or 24-word recovery phrase"),
  ),
  LENDASWAP_API_URL: withDefault(z.url(), "https://api.lendaswap.com"),

  // "Pay from another chain" (lib/payin): a client pays with USDT/USDC on Tron, BNB Chain, Solana…
  // and NEAR Intents' 1Click API swaps it into USDT on Polygon, sent straight to the merchant.
  // NimBill never holds the money or any key. PAYIN_LIVE="false" hides the option.
  // ONECLICK_API_KEY is the partner JWT from partners.near-intents.org: without it 1Click adds
  // 0.25% to every payment and may set a higher minimum.
  PAYIN_LIVE: withDefault(z.enum(["true", "false"]), "true"),
  ONECLICK_API_URL: withDefault(z.url(), "https://1click.chaindefuser.com"),
  ONECLICK_API_KEY: optional(z.string()),

  // Demo invoice
  DEMO_MERCHANT_ADDRESS: optional(z.string()),
  DEMO_MERCHANT_NAME: optional(z.string().max(80)),
  DEMO_MERCHANT_EVM_ADDRESS: optional(z.string().regex(/^0x[0-9a-fA-F]{40}$/, "DEMO_MERCHANT_EVM_ADDRESS must be a 0x… address")),

  // External services
  NIMIQ_RPC_URL: withDefault(z.url(), "https://rpc.nimiqwatch.com"),
  POLYGON_RPC_URL: withDefault(z.url(), "https://polygon-bor-rpc.publicnode.com"),
  ETHEREUM_RPC_URL: withDefault(z.url(), "https://ethereum-rpc.publicnode.com"),
  // arb1, not publicnode: publicnode refuses receipts from blocks old enough to be final.
  ARBITRUM_RPC_URL: withDefault(z.url(), "https://arb1.arbitrum.io/rpc"),
  VALIDATORS_API_URL: optional(z.url()),
  COINGECKO_API_KEY: optional(z.string()),

  // Email ("invoice paid" notifications to merchants), sent through Resend. Optional: without
  // RESEND_API_KEY no email is sent and everything else works as usual. See lib/clients/mail.ts.
  RESEND_API_KEY: optional(z.string()),
  MAIL_FROM: optional(z.string()), // "NimBill <billing@your-domain.com>"; defaults to Resend's shared test sender
  RESEND_API_URL: withDefault(z.url(), "https://api.resend.com"),

  // Public URL (link previews, links in emails)
  SITE_URL: optional(z.url()),
  PORT: optional(z.coerce.number().int().positive()),
  VERCEL: optional(z.string()),
  VERCEL_PROJECT_PRODUCTION_URL: optional(z.string()),

  // Sentry (optional: Sentry stays off without a DSN)
  NEXT_PUBLIC_SENTRY_DSN: optional(z.url()),
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: optional(z.string()),
});

export type Env = z.infer<typeof Schema>;

function load(): Env {
  const parsed = Schema.safeParse(process.env);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw Errors.config(`Invalid environment variables:\n${problems}`, { cause: parsed.error });
}

export const env: Env = load();

export const isProd = env.NODE_ENV === "production";
