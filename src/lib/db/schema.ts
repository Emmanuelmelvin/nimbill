import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export type LineItem = { description: string; quantity: number; unitPrice: number };

export const merchants = pgTable("merchants", {
  address: text("address").primaryKey(), // Nimiq user-friendly address, "NQ.. .... ..."
  name: text("name").notNull().default(""),
  evmAddress: text("evm_address"), // optional, enables USDT (Polygon) payments
  email: text("email"), // optional, private: where "invoice paid" emails go. Never shown publicly.
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
});

// A rate-locked price for paying an invoice with a given asset.
export const quotes = pgTable("quotes", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id").notNull(),
  asset: text("asset").$type<"NIM" | "USDT">().notNull(),
  amount: text("amount").notNull(), // smallest units
  rate: text("rate").notNull(), // fiat per 1 coin
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type Invoice = typeof invoices.$inferSelect;
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
`;
