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
  // When someone other than the merchant first opened the invoice page while it was unpaid.
  // Private to the merchant ("Sent → Viewed → Paid"); null = not opened yet.
  viewedAt: timestamp("viewed_at", { withTimezone: true }),
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
  amount: text("amount").notNull(), // Luna, as string
  currency: text("currency").notNull(), // what the sender typed the amount in: a fiat code or "NIM"
  fiatAmount: text("fiat_amount").notNull(), // the typed amount, decimal string in `currency`
  rate: text("rate").notNull(), // `currency` per 1 NIM used ("1" when sent in NIM)
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
  claimedByAddress: text("claimed_by_address"),
  claimedByName: text("claimed_by_name"),
  claimedByTag: text("claimed_by_tag"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  fundedAt: timestamp("funded_at", { withTimezone: true }),
  settledAt: timestamp("settled_at", { withTimezone: true }),
});

export type Cheque = typeof cheques.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Transfer = typeof transfers.$inferSelect;
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
`;
