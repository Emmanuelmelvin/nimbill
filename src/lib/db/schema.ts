import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export type LineItem = { description: string; quantity: number; unitPrice: number };

export const merchants = pgTable("merchants", {
  address: text("address").primaryKey(), // Nimiq user-friendly address, "NQ.. .... ..."
  name: text("name").notNull().default(""),
  evmAddress: text("evm_address"), // optional, enables USDT (Polygon) payments
  email: text("email"), // optional, private: where "invoice paid" emails go. Never shown publicly.
  displayCurrency: text("display_currency"), // fiat the dashboard shows totals in; null = follow the latest invoice
  invoiceCounter: integer("invoice_counter").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: text("id").primaryKey(),
  number: text("number").notNull(),
  merchantAddress: text("merchant_address").notNull(),
  merchantName: text("merchant_name").notNull(),
  merchantEvmAddress: text("merchant_evm_address"),
  clientName: text("client_name").notNull(),
  clientEmail: text("client_email"),
  items: jsonb("items").$type<LineItem[]>().notNull(),
  currency: text("currency").notNull(),
  total: text("total").notNull(), // decimal string in `currency`
  note: text("note"),
  dueDate: text("due_date"), // YYYY-MM-DD
  status: text("status").$type<"unpaid" | "paid" | "cancelled">().notNull().default("unpaid"),
  isDemo: boolean("is_demo").notNull().default(false),
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

export type Invoice = typeof invoices.$inferSelect;
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
`;
