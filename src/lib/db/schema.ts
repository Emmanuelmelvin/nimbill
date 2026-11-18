import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export type LineItem = { description: string; quantity: number; unitPrice: number };

export const merchants = pgTable("merchants", {
  address: text("address").primaryKey(), // Nimiq user-friendly address, "NQ.. .... ..."
  name: text("name").notNull().default(""),
  evmAddress: text("evm_address"), // optional, enables USDT (Polygon) payments
  email: text("email"), // optional, private: where "invoice paid" emails go. Never shown publicly.
  displayCurrency: text("display_currency"), // fiat the dashboard shows totals in; null = follow the latest invoice
  invoiceCounter: integer("invoice_counter").notNull().default(0),
  // Public handle, shown as "<tag>@nimbill" (see lib/tags.ts). Unique; null until claimed.
  tag: text("tag").unique(),
  tagChangedAt: timestamp("tag_changed_at", { withTimezone: true }),
  // Public board: a line about the merchant, and whether visitors may pay any amount they type.
  bio: text("bio"),
  boardOpenAmounts: boolean("board_open_amounts").notNull().default(true),
  // Public photo shown on the board and to people sending money. Goes up with every new photo so
  // its URL changes; null = no photo (initials are shown). The photo itself is in merchant_avatars.
  avatarVersion: integer("avatar_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Tags someone gave up. Held for a while so nobody else can grab one and receive payments
// meant for its previous owner. The previous owner can take it back at any time.
export const retiredTags = pgTable("retired_tags", {
  tag: text("tag").primaryKey(),
  address: text("address").notNull(),
  retiredAt: timestamp("retired_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: text("id").primaryKey(),
  number: text("number").notNull(),
  merchantAddress: text("merchant_address").notNull(),
  merchantName: text("merchant_name").notNull(),
  merchantEvmAddress: text("merchant_evm_address"),
  clientName: text("client_name").notNull(),
  clientEmail: text("client_email"),
  // Optional email entered by the invoice payer to receive their payment confirmation and PDF receipt.
  // Private: never exposed on PublicInvoice.
  payerEmail: text("payer_email"),
  items: jsonb("items").$type<LineItem[]>().notNull(),
  currency: text("currency").notNull(),
  total: text("total").notNull(), // decimal string in `currency`
  note: text("note"),
  dueDate: text("due_date"), // YYYY-MM-DD
  status: text("status").$type<"unpaid" | "paid" | "cancelled">().notNull().default("unpaid"),
  isDemo: boolean("is_demo").notNull().default(false),
  // "direct": the merchant made it. "board": a visitor made it on the merchant's public board.
  // Board invoices are numbered "NMN-…" until paid, then get the merchant's next "INV-…" number,
  // so unpaid ones never leave gaps in the merchant's sequence.
  source: text("source").$type<"direct" | "board">().notNull().default("direct"),
  productId: text("product_id"), // the product bought on the board, if any
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Filled once payment is verified on-chain
  paidAsset: text("paid_asset").$type<"NIM" | "USDT">(),
  paidAmount: text("paid_amount"), // smallest units (Luna / USDT 6-decimals) as string
  paidRate: text("paid_rate"), // fiat per 1 coin used for the accepted quote
  paidTxHash: text("paid_tx_hash").unique(),
  paidFrom: text("paid_from"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  // Value of the payment in US dollars when it was verified, so earnings in different
  // currencies can be added up. Null until filled (older rows are backfilled, see lib/earnings.ts).
  paidUsd: text("paid_usd"),
  // What the client added on top of `total` as a tip, decimal string in `currency`. Null = no tip.
  // `paidAmount` and `paidUsd` already include it.
  paidTip: text("paid_tip"),
  // How many times the receipt was emailed on request (POST /api/invoices/[id]/receipt). Capped,
  // so the public endpoint can't be used to send unlimited emails to arbitrary addresses.
  receiptEmailsSent: integer("receipt_emails_sent").notNull().default(0),
  // When someone other than the merchant first opened the invoice page while it was unpaid.
  // Private to the merchant ("Sent → Viewed → Paid"); null = not opened yet.
  viewedAt: timestamp("viewed_at", { withTimezone: true }),
  // "Pay with NimBill": the merchant's webhook endpoint id, set when their store created this board
  // invoice with a request signed by its webhook secret (see lib/webhooks.ts). Only these invoices
  // send store webhooks, and only on these are `reference`, `metadata` and `returnUrl` set.
  // Null = made anonymously (a visitor, an agent).
  integrationId: text("integration_id"),
  reference: text("reference"), // the store's own order id; private to the merchant and the store
  metadata: jsonb("metadata").$type<Record<string, string>>(), // the store's key/values, sent back in webhooks
  returnUrl: text("return_url"), // where the payer goes back to after paying, on the store's allowed origin
  // Set when this invoice was generated from a recurring schedule (`recurring_invoices.id`).
  recurringId: text("recurring_id"),
});

export type RecurringInterval = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
export type RecurringStatus = "active" | "paused" | "cancelled";

// A schedule that automatically creates and sends a new invoice on a fixed cadence.
export const recurringInvoices = pgTable("recurring_invoices", {
  id: text("id").primaryKey(), // "rec_…"
  merchantAddress: text("merchant_address").notNull(),
  merchantName: text("merchant_name").notNull(),
  merchantEvmAddress: text("merchant_evm_address"),
  clientName: text("client_name").notNull(),
  clientEmail: text("client_email"),
  items: jsonb("items").$type<LineItem[]>().notNull(),
  currency: text("currency").notNull(),
  total: text("total").notNull(), // decimal string in `currency`
  note: text("note"),
  interval: text("interval").$type<RecurringInterval>().notNull(),
  dueDays: integer("due_days").notNull().default(7), // days after issue date the invoice is due (0 = due on issue date)
  nextRunDate: text("next_run_date").notNull(), // YYYY-MM-DD when the next invoice will be generated
  // Day of the month (1-31) that monthly/quarterly/yearly cycles land on, clamped in short months.
  // Kept apart from nextRunDate so a schedule started on the 31st returns to the 31st after February.
  anchorDay: integer("anchor_day"),
  lastRunDate: text("last_run_date"), // YYYY-MM-DD of the most recent generated cycle
  lastInvoiceId: text("last_invoice_id"),
  generatedCount: integer("generated_count").notNull().default(0),
  status: text("status").$type<RecurringStatus>().notNull().default("active"),
  cancelledBy: text("cancelled_by").$type<"merchant" | "client">(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// An earnings target for a period. Progress is computed from paid invoices, never stored.
export const goals = pgTable("goals", {
  id: text("id").primaryKey(),
  merchantAddress: text("merchant_address").notNull(),
  title: text("title").notNull(),
  targetAmount: text("target_amount").notNull(), // decimal string in `currency`
  currency: text("currency").notNull(), // a fiat code, "NIM" or "USDT"
  startDate: text("start_date").notNull(), // YYYY-MM-DD, inclusive
  endDate: text("end_date").notNull(), // YYYY-MM-DD, inclusive
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A rate-locked price for paying an invoice with a given asset.
export const quotes = pgTable("quotes", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id").notNull(),
  asset: text("asset").$type<"NIM" | "USDT">().notNull(),
  amount: text("amount").notNull(), // smallest units; covers the invoice total plus `tip`
  rate: text("rate").notNull(), // fiat per 1 coin
  tip: text("tip").notNull().default("0"), // the client's tip, decimal string in the invoice currency
  payerEmail: text("payer_email"), // optional email entered by the payer when locking the quote
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// People a merchant bills often, saved so the next invoice can be addressed with one tap.
// `nameKey` is the name lower-cased and trimmed: one saved entry per client name.
export const clients = pgTable("clients", {
  id: text("id").primaryKey(),
  merchantAddress: text("merchant_address").notNull(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull(),
  email: text("email"), // optional, private, like invoices.client_email
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Money sent from one NimBill user to another by tag. NIM only: the transaction carries
// `NimBill T <id>` as data, which is how it is matched and verified on-chain.
// Kept apart from invoices, so transfers never count as earnings.
export const transfers = pgTable("transfers", {
  id: text("id").primaryKey(),
  fromAddress: text("from_address").notNull(),
  fromName: text("from_name").notNull(), // as it was when sent
  fromTag: text("from_tag"),
  toAddress: text("to_address").notNull(),
  toName: text("to_name").notNull(),
  toTag: text("to_tag").notNull(),
  // The coin sent. NIM is matched by its memo. USDT (Polygon) can't carry a memo, so its `amount`
  // is made unique per recipient wallet (see usdt-amounts.ts) and checked against both wallets.
  asset: text("asset").$type<"NIM" | "USDT">().notNull().default("NIM"),
  amount: text("amount").notNull(), // smallest unit of `asset`, as string: Luna, or USDT with 6 decimals
  currency: text("currency").notNull(), // what the sender typed the amount in: a fiat code, "NIM" or "USDT"
  fiatAmount: text("fiat_amount").notNull(), // the typed amount, decimal string in `currency`
  rate: text("rate").notNull(), // `currency` per 1 `asset` used ("1" when typed in the coin itself)
  // USDT only: both Polygon wallets at send time. The recipient's is kept so changing it later
  // can't redirect or confuse the match; the sender's ties the on-chain transfer to them.
  toEvmAddress: text("to_evm_address"),
  fromEvmAddress: text("from_evm_address"),
  note: text("note"), // private to sender and recipient, never on-chain
  status: text("status").$type<"pending" | "confirmed">().notNull().default("pending"),
  txHash: text("tx_hash").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

// What a merchant sells on their board. Buying one makes an invoice with the product as its line.
export const products = pgTable("products", {
  id: text("id").primaryKey(),
  merchantAddress: text("merchant_address").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  price: text("price").notNull(), // decimal string in `currency`
  currency: text("currency").notNull(),
  active: boolean("active").notNull().default(true), // false = hidden from the board
  // Changes whenever the picture changes, so its URL changes and caches never show an old one.
  // Null = no picture.
  imageVersion: integer("image_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Product pictures, kept in the database so the app needs no separate file storage.
// They are shrunk in the browser before upload (see lib/products.ts for the size limit).
export const productImages = pgTable("product_images", {
  productId: text("product_id").primaryKey(),
  mime: text("mime").notNull(),
  data: text("data").notNull(), // base64
});

// Merchant photos, kept in the database like product pictures (square, shrunk in the browser).
export const merchantAvatars = pgTable("merchant_avatars", {
  address: text("address").primaryKey(),
  mime: text("mime").notNull(),
  data: text("data").notNull(), // base64
});

// Money funded into a throwaway 2-of-2 Ed25519 cheque wallet (`chequeAddress`).
// Either locked to a specific recipient's NimBill tag (`recipientTag`), or a free cheque
// where the first person with the link/QR/code to claim gets the NIM.
export const cheques = pgTable("cheques", {
  id: text("id").primaryKey(),
  writerAddress: text("writer_address").notNull(),
  writerName: text("writer_name").notNull(),
  writerTag: text("writer_tag"),
  chequeAddress: text("cheque_address").notNull().unique(),
  chequePublicKey: text("cheque_public_key").notNull(),
  linkPublicKey: text("link_public_key").notNull(),
  recipientTag: text("recipient_tag"), // null = free cheque (first to claim gets it)
  recipientName: text("recipient_name"),
  // Wallet the tag pointed to when the cheque was written. A tag-locked cheque can only be cashed
  // here, so a tag that is later released and re-registered can't redirect it. Null on old rows.
  recipientAddress: text("recipient_address"),
  // Which secret derives the server's half of the key: "cheque" = CHEQUE_KEY_SECRET,
  // "session" = SESSION_SECRET (cheques written before CHEQUE_KEY_SECRET existed).
  keyRef: text("key_ref").notNull().default("session"),
  amount: text("amount").notNull(), // Luna, as string
  currency: text("currency").notNull(), // a fiat code or "NIM"
  fiatAmount: text("fiat_amount").notNull(), // typed amount, decimal string in `currency`
  rate: text("rate").notNull(), // `currency` per 1 NIM ("1" when written in NIM)
  note: text("note"),
  // settling = a cash/cancel transaction was broadcast and is waiting to be included in a block.
  status: text("status").$type<"pending" | "funded" | "settling" | "cashed" | "cancelled">().notNull().default("pending"),
  fundTxHash: text("fund_tx_hash").unique(),
  settleTxHash: text("settle_tx_hash").unique(),
  // Optional Nimiq HTLC contract protection: once funded, the 2-of-2 cheque wallet moves the funds into
  // an on-chain HTLC (`htlcAddress`) where `recipient` = chequeAddress (2-of-2) and `sender` = `refundAddress`
  // (derived from the link secret alone). After `htlcTimeoutAt` (30 days), the writer can reclaim 100% of
  // the NIM directly on-chain via `TimeoutResolve` even if NimBill's server is offline forever.
  refundAddress: text("refund_address"),
  htlcAddress: text("htlc_address"),
  htlcTxHash: text("htlc_tx_hash"),
  htlcTimeoutAt: timestamp("htlc_timeout_at", { withTimezone: true }),
  claimedByAddress: text("claimed_by_address"),
  claimedByName: text("claimed_by_name"),
  claimedByTag: text("claimed_by_tag"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  fundedAt: timestamp("funded_at", { withTimezone: true }),
  settledAt: timestamp("settled_at", { withTimezone: true }),
});

// "Pay with NimBill": where a merchant's store receives webhooks. One per merchant.
// Its secret signs both ways: the store signs the invoices it creates, NimBill signs every webhook.
export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: text("id").primaryKey(), // "we_…"
  merchantAddress: text("merchant_address").notNull().unique(),
  url: text("url").notNull(), // where webhooks are POSTed
  // The one origin (scheme://host[:port]) an invoice's returnUrl may point to. Null = no returnUrl allowed.
  returnOrigin: text("return_origin"),
  // AES-256-GCM with WEBHOOK_KEY_SECRET (see lib/webhooks.ts). HMAC needs the secret itself, so it
  // can't be hashed like a password.
  secretEnc: text("secret_enc").notNull(),
  // After a rotation the old secret keeps working until `previousExpiresAt`, so the store can switch over.
  previousSecretEnc: text("previous_secret_enc"),
  previousExpiresAt: timestamp("previous_expires_at", { withTimezone: true }),
  enabled: boolean("enabled").notNull().default(true),
  // Health (lib/webhook-health.ts): the first failed attempt since the last 2xx, and how many in a row.
  // Reset by any delivered webhook and by the merchant saving a new URL or turning webhooks back on.
  failingSince: timestamp("failing_since", { withTimezone: true }),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  warnedAt: timestamp("warned_at", { withTimezone: true }), // "will be removed" warning sent
  // Set when NimBill turned webhooks off itself ("failing": the URL kept failing). Null = on, or the merchant turned them off.
  disabledReason: text("disabled_reason").$type<"failing">(),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// "webhook.test": sent from Settings → Webhooks with a made-up invoice (`invoice_id` is "test_…").
export type WebhookEventType = "invoice.paid" | "webhook.test";

// Outbox: one row per thing that happened, written where it happens (markPaid) and delivered by
// the webhook worker. A merchant has one endpoint, so the row also tracks its delivery.
// unique(type, invoice_id) makes writing it idempotent, so missed rows can safely be added again.
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(), // "evt_…", the same on every retry so stores can drop duplicates
  merchantAddress: text("merchant_address").notNull(),
  type: text("type").$type<WebhookEventType>().notNull(),
  invoiceId: text("invoice_id").notNull(),
  // pending -> delivered, or failed after the last retry. The payload is built when it is sent.
  status: text("status").$type<"pending" | "delivered" | "failed">().notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lastStatus: integer("last_status"), // HTTP status of the last attempt; null = no response
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
});

// Withdrawals (lib/withdraw): NIM or USDT turned into USDC/USDT on another chain. Nimiq Pay pays a
// Lightning invoice (step 1), a provider such as Lendaswap turns it into the stablecoin (step 2),
// and the worker claims it to `destination`. Both steps' IDs are kept, so a stuck or failed
// withdrawal can always be traced to where the money is.
export type WithdrawalStatus =
  | "requested" // the user asked for it; the worker has not created the provider swap yet
  | "quoted" // the provider swap exists and its Lightning invoice is waiting to be paid
  | "paying" // the user approved in Nimiq Pay; the Lightning payment is on its way
  | "swapping" // the provider got the Lightning payment and is locking the stablecoin
  | "delivering" // the claim was sent; waiting for it to be final on the destination chain
  | "delivered" // the stablecoin is in the destination wallet (checked on-chain)
  | "expired" // the invoice ran out before it was paid; nothing was spent
  | "cancelled" // the user declined in Nimiq Pay; nothing was spent
  | "refund_pending" // something failed after payment; the money is on its way back
  | "refunded"
  | "failed"; // needs a human: see `failureReason`

export type WithdrawalFee = { label: string; amount: string; asset: string }; // amount in the asset's smallest unit
export type WithdrawalStatusChange = { status: WithdrawalStatus; at: string; note?: string };

export const withdrawals = pgTable("withdrawals", {
  id: text("id").primaryKey(), // "wd_…"
  nimiqAddress: text("nimiq_address").notNull(), // who withdrew, "NQ.. .... ..."
  payWith: text("pay_with").$type<"NIM" | "USDT">().notNull(),
  chain: text("chain").notNull(), // a ChainId from lib/withdraw/chains.ts
  asset: text("asset").$type<"USDC" | "USDT">().notNull(),
  destination: text("destination").notNull(), // address on `chain`, checksummed for EVM
  // Amounts are in the smallest unit, as strings: Luna for NIM, 6 decimals for USDC/USDT.
  receiveAmount: text("receive_amount").notNull(), // what the user asked to receive
  receiveMin: text("receive_min"), // the least the provider guarantees
  sendEstimate: text("send_estimate"), // the "about" amount shown before approval, in `payWith`
  sendActual: text("send_actual"), // what Nimiq Pay actually took, once known
  fees: jsonb("fees").$type<WithdrawalFee[]>().notNull().default([]),
  // Step 2: the provider's swap and the Lightning invoice it asked us to pay.
  providerId: text("provider_id"), // "lendaswap", …
  providerSwapId: text("provider_swap_id"),
  lightningInvoice: text("lightning_invoice"), // BOLT11
  invoiceSats: text("invoice_sats"),
  invoicePaymentHash: text("invoice_payment_hash"),
  quoteExpiresAt: timestamp("quote_expires_at", { withTimezone: true }),
  // Step 1: what `payLightningInvoice` gave back in Nimiq Pay.
  payTxHash: text("pay_tx_hash"),
  paySwapId: text("pay_swap_id"),
  // The end: the transfer into `destination`.
  destinationTxHash: text("destination_tx_hash"),
  status: text("status").$type<WithdrawalStatus>().notNull().default("requested"),
  statusHistory: jsonb("status_history").$type<WithdrawalStatusChange[]>().notNull().default([]),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// The Lendaswap SDK's state (lib/withdraw/storage.ts). One wallet row: the next key index (the
// recovery phrase itself is WITHDRAW_MNEMONIC, never stored). One row per swap, encrypted.
export const withdrawWallet = pgTable("withdraw_wallet", {
  id: text("id").primaryKey(),
  keyIndex: integer("key_index").notNull().default(0),
});
export const withdrawSwaps = pgTable("withdraw_swaps", {
  swapId: text("swap_id").primaryKey(),
  dataEnc: text("data_enc").notNull(), // AES-256-GCM, key derived from WITHDRAW_MNEMONIC
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Who wants to cash out to a bank or mobile money once that exists, and how: demand data for
// choosing the first fiat partner. One row per Nimiq address.
export const fiatWaitlist = pgTable("fiat_waitlist", {
  nimiqAddress: text("nimiq_address").primaryKey(),
  country: text("country").notNull(), // "NG", "GH", "KE", "ZA" or "other"
  method: text("method").notNull(), // "bank" | "mobile_money" | "cash_agent"
  monthly: text("monthly").notNull(), // expected monthly amount, a bucket from lib/withdraw/schemas.ts
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Withdrawal = typeof withdrawals.$inferSelect;
export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type Cheque = typeof cheques.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Transfer = typeof transfers.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type RecurringInvoice = typeof recurringInvoices.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type Merchant = typeof merchants.$inferSelect;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS merchants (
  address text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  evm_address text,
  email text,
  invoice_counter integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS invoices (
  id text PRIMARY KEY,
  number text NOT NULL,
  merchant_address text NOT NULL,
  merchant_name text NOT NULL,
  merchant_evm_address text,
  client_name text NOT NULL,
  client_email text,
  items jsonb NOT NULL,
  currency text NOT NULL,
  total text NOT NULL,
  note text,
  due_date text,
  status text NOT NULL DEFAULT 'unpaid',
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_asset text,
  paid_amount text,
  paid_rate text,
  paid_tx_hash text UNIQUE,
  paid_from text,
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS invoices_merchant_idx ON invoices (merchant_address, created_at DESC);
CREATE TABLE IF NOT EXISTS quotes (
  id text PRIMARY KEY,
  invoice_id text NOT NULL,
  asset text NOT NULL,
  amount text NOT NULL,
  rate text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS quotes_invoice_idx ON quotes (invoice_id);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS display_currency text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_usd text;
CREATE TABLE IF NOT EXISTS goals (
  id text PRIMARY KEY,
  merchant_address text NOT NULL,
  title text NOT NULL,
  target_amount text NOT NULL,
  currency text NOT NULL,
  start_date text NOT NULL,
  end_date text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS goals_merchant_idx ON goals (merchant_address, end_date DESC);
CREATE TABLE IF NOT EXISTS clients (
  id text PRIMARY KEY,
  merchant_address text NOT NULL,
  name text NOT NULL,
  name_key text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS clients_merchant_name_idx ON clients (merchant_address, name_key);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS tip text NOT NULL DEFAULT '0';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_tip text;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS tag text;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS tag_changed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS merchants_tag_idx ON merchants (tag);
CREATE TABLE IF NOT EXISTS retired_tags (
  tag text PRIMARY KEY,
  address text NOT NULL,
  retired_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS transfers (
  id text PRIMARY KEY,
  from_address text NOT NULL,
  from_name text NOT NULL,
  from_tag text,
  to_address text NOT NULL,
  to_name text NOT NULL,
  to_tag text NOT NULL,
  amount text NOT NULL,
  currency text NOT NULL,
  fiat_amount text NOT NULL,
  rate text NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending',
  tx_hash text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);
CREATE INDEX IF NOT EXISTS transfers_from_idx ON transfers (from_address, created_at DESC);
CREATE INDEX IF NOT EXISTS transfers_to_idx ON transfers (to_address, created_at DESC);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS board_open_amounts boolean NOT NULL DEFAULT true;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'direct';
CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  merchant_address text NOT NULL,
  name text NOT NULL,
  description text,
  price text NOT NULL,
  currency text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  image_version integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_merchant_idx ON products (merchant_address, created_at DESC);
CREATE TABLE IF NOT EXISTS product_images (
  product_id text PRIMARY KEY,
  mime text NOT NULL,
  data text NOT NULL
);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS product_id text;
CREATE INDEX IF NOT EXISTS invoices_board_idx ON invoices (merchant_address, source, created_at DESC);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS avatar_version integer;
CREATE TABLE IF NOT EXISTS merchant_avatars (
  address text PRIMARY KEY,
  mime text NOT NULL,
  data text NOT NULL
);
CREATE TABLE IF NOT EXISTS cheques (
  id text PRIMARY KEY,
  writer_address text NOT NULL,
  writer_name text NOT NULL,
  writer_tag text,
  cheque_address text NOT NULL UNIQUE,
  cheque_public_key text NOT NULL,
  link_public_key text NOT NULL,
  recipient_tag text,
  recipient_name text,
  amount text NOT NULL,
  currency text NOT NULL,
  fiat_amount text NOT NULL,
  rate text NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending',
  fund_tx_hash text UNIQUE,
  settle_tx_hash text UNIQUE,
  claimed_by_address text,
  claimed_by_name text,
  claimed_by_tag text,
  created_at timestamptz NOT NULL DEFAULT now(),
  funded_at timestamptz,
  settled_at timestamptz
);
CREATE INDEX IF NOT EXISTS cheques_writer_idx ON cheques (writer_address, created_at DESC);
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS recipient_address text;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS key_ref text NOT NULL DEFAULT 'session';
CREATE INDEX IF NOT EXISTS cheques_claimed_by_idx ON cheques (claimed_by_address);
CREATE INDEX IF NOT EXISTS cheques_recipient_address_idx ON cheques (recipient_address);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS viewed_at timestamptz;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS asset text NOT NULL DEFAULT 'NIM';
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS to_evm_address text;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS from_evm_address text;
CREATE INDEX IF NOT EXISTS transfers_to_evm_idx ON transfers (lower(to_evm_address), created_at DESC);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS integration_id text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS return_url text;
CREATE INDEX IF NOT EXISTS invoices_integration_idx ON invoices (integration_id, created_at DESC);
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id text PRIMARY KEY,
  merchant_address text NOT NULL UNIQUE,
  url text NOT NULL,
  return_origin text,
  secret_enc text NOT NULL,
  previous_secret_enc text,
  previous_expires_at timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webhook_events (
  id text PRIMARY KEY,
  merchant_address text NOT NULL,
  type text NOT NULL,
  invoice_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_status integer,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_once_idx ON webhook_events (type, invoice_id);
ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS failing_since timestamptz;
ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0;
ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS warned_at timestamptz;
ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS disabled_reason text;
ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
CREATE INDEX IF NOT EXISTS webhook_events_due_idx ON webhook_events (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS webhook_events_merchant_idx ON webhook_events (merchant_address, created_at DESC);
CREATE TABLE IF NOT EXISTS withdrawals (
  id text PRIMARY KEY,
  nimiq_address text NOT NULL,
  pay_with text NOT NULL,
  chain text NOT NULL,
  asset text NOT NULL,
  destination text NOT NULL,
  receive_amount text NOT NULL,
  receive_min text,
  send_estimate text,
  send_actual text,
  fees jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider_id text,
  provider_swap_id text,
  lightning_invoice text,
  invoice_sats text,
  invoice_payment_hash text,
  quote_expires_at timestamptz,
  pay_tx_hash text,
  pay_swap_id text,
  destination_tx_hash text,
  status text NOT NULL DEFAULT 'requested',
  status_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS withdrawals_owner_idx ON withdrawals (nimiq_address, created_at DESC);
CREATE INDEX IF NOT EXISTS withdrawals_open_idx ON withdrawals (status, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS withdrawals_provider_swap_idx ON withdrawals (provider_id, provider_swap_id);
CREATE TABLE IF NOT EXISTS withdraw_wallet (
  id text PRIMARY KEY,
  key_index integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS withdraw_swaps (
  swap_id text PRIMARY KEY,
  data_enc text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fiat_waitlist (
  nimiq_address text PRIMARY KEY,
  country text NOT NULL,
  method text NOT NULL,
  monthly text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS refund_address text;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS htlc_address text;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS htlc_tx_hash text;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS htlc_timeout_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recurring_id text;
CREATE INDEX IF NOT EXISTS invoices_recurring_idx ON invoices (recurring_id, created_at DESC);
CREATE TABLE IF NOT EXISTS recurring_invoices (
  id text PRIMARY KEY,
  merchant_address text NOT NULL,
  merchant_name text NOT NULL,
  merchant_evm_address text,
  client_name text NOT NULL,
  client_email text,
  items jsonb NOT NULL,
  currency text NOT NULL,
  total text NOT NULL,
  note text,
  interval text NOT NULL,
  due_days integer NOT NULL DEFAULT 7,
  next_run_date text NOT NULL,
  anchor_day integer,
  last_run_date text,
  last_invoice_id text,
  generated_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  cancelled_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS cancelled_by text;
ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS anchor_day integer;
CREATE INDEX IF NOT EXISTS recurring_invoices_merchant_idx ON recurring_invoices (merchant_address, created_at DESC);
CREATE INDEX IF NOT EXISTS recurring_invoices_due_idx ON recurring_invoices (status, next_run_date);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payer_email text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS receipt_emails_sent integer NOT NULL DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payer_email text;
`;
