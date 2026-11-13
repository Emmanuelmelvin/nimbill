// Dev helper: fill the local embedded database with paid and unpaid invoices for the fixed dev
// test key (the one scripts/dev-signin.mjs signs in as), so the earnings chart, goals and client
// list have something to show. Nothing here touches a blockchain or a production database.
//
// Run from the project folder while the dev server is STOPPED (PGlite allows one process at a time):
//   npm run dev:seed
// Running it again replaces the seeded rows; your own invoices are left alone.
import { PGlite } from "@electric-sql/pglite";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { SCHEMA_SQL } from "../src/lib/db/schema.ts";
import { addressFromPublicKey } from "../src/lib/nimiq-address.ts";

if (process.env.DATABASE_URL) {
  console.error("DATABASE_URL is set. This script only seeds the local embedded database.");
  process.exit(1);
}

const address = addressFromPublicKey(ed25519.getPublicKey(sha256(utf8ToBytes("nimbill-dev-test-key"))));
const db = new PGlite(`${process.cwd()}/.data/pglite`);
await db.exec(SCHEMA_SQL);
await db.query(`INSERT INTO merchants (address, name) VALUES ($1, 'Ada Studio') ON CONFLICT (address) DO NOTHING`, [address]);
await db.query(`DELETE FROM invoices WHERE merchant_address = $1 AND id LIKE 'seed%'`, [address]);

const DAY = 86_400_000;
const now = Date.now();
const NIM_USD = 0.001;

// [days ago, client, currency, total, paid in, value in USD (tip included), tip in the invoice currency]
const paid: [number, string, string, number, "NIM" | "USDT", number, number?][] = [
  [0.1, "Lagos Bakery", "NGN", 45_000, "USDT", 30],
  [1, "Acme Ltd", "USD", 120, "NIM", 132, 12], // the client added a 10% tip
  [3, "Lagos Bakery", "NGN", 90_000, "NIM", 60],
  [6, "Kito Media", "USD", 250, "USDT", 250],
  [9, "Acme Ltd", "USD", 80, "NIM", 80],
  [14, "Kito Media", "USD", 310, "USDT", 310],
  [20, "Lagos Bakery", "NGN", 150_000, "NIM", 100],
  [27, "Acme Ltd", "USD", 60, "NIM", 60],
  [36, "Kito Media", "USD", 400, "USDT", 400],
  [50, "Acme Ltd", "USD", 150, "NIM", 150],
  [75, "Lagos Bakery", "NGN", 60_000, "USDT", 40],
  [130, "Orbit Co", "EUR", 500, "USDT", 540],
  [240, "Orbit Co", "EUR", 300, "NIM", 325],
];

let n = 0;
const id = () => `seed${String(++n).padStart(6, "0")}`;
for (const [ago, client, currency, total, asset, usd, tip = 0] of paid) {
  const invoiceId = id();
  const at = new Date(now - ago * DAY);
  const coins = asset === "NIM" ? usd / NIM_USD : usd;
  await db.query(
    `INSERT INTO invoices (id, number, merchant_address, merchant_name, client_name, items, currency, total, status, created_at,
       paid_asset, paid_amount, paid_rate, paid_tx_hash, paid_from, paid_at, paid_usd, paid_tip)
     VALUES ($1, $2, $3, 'Ada Studio', $4, $5, $6, $7, 'paid', $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      invoiceId,
      `SEED-${String(n).padStart(3, "0")}`,
      address,
      client,
      JSON.stringify([{ description: "Design work", quantity: 1, unitPrice: total }]),
      currency,
      total.toFixed(2),
      new Date(at.getTime() - 2 * DAY),
      asset,
      String(Math.round(coins * (asset === "NIM" ? 1e5 : 1e6))),
      String((total + tip) / coins),
      (asset === "NIM" ? "" : "0x") + invoiceId.padEnd(64, "0"),
      "seed-payer",
      at,
      // Two rows have no dollar value yet, like payments from before the column existed (see backfill in lib/ledger.ts).
      n === 5 || n === 12 ? null : usd.toFixed(6),
      tip > 0 ? tip.toFixed(2) : null,
    ],
  );
}

// [client, currency, total, days until due (negative = overdue), or null for no due date]
const open: [string, string, number, number | null][] = [
  ["Acme Ltd", "USD", 200, 10],
  ["Lagos Bakery", "NGN", 75_000, -4],
  ["Nova Labs", "KES", 26_000, null],
];
for (const [client, currency, total, due] of open) {
  const invoiceId = id();
  await db.query(
    `INSERT INTO invoices (id, number, merchant_address, merchant_name, client_name, items, currency, total, due_date, status, created_at)
     VALUES ($1, $2, $3, 'Ada Studio', $4, $5, $6, $7, $8, 'unpaid', $9)`,
    [
      invoiceId,
      `SEED-${String(n).padStart(3, "0")}`,
      address,
      client,
      JSON.stringify([{ description: "Monthly retainer", quantity: 1, unitPrice: total }]),
      currency,
      total.toFixed(2),
      due === null ? null : new Date(now + due * DAY).toISOString().slice(0, 10),
      new Date(now - 10 * DAY - n * 1000),
    ],
  );
}

// Cheques in every state the "My cheques" tab shows: written by the dev account, cashed by it,
// and made out to it. Wallet addresses are random keys, so none of these can move real money.
const randomAddress = () => addressFromPublicKey(ed25519.getPublicKey(ed25519.utils.randomSecretKey()));
const other = randomAddress();
await db.query(`DELETE FROM cheques WHERE id LIKE 'seedc%'`);
// [id, writer, writer name, status, recipient address (tag-locked), claimed by, NIM, days ago, note]
const cheques: [string, string, string, string, string | null, string | null, number, number, string][] = [
  ["seedcaa222", address, "Ada Studio", "funded", null, null, 25, 1, "Birthday gift"],
  ["seedcaa333", address, "Ada Studio", "cashed", null, other, 10, 3, "Lunch"],
  ["seedcaa444", address, "Ada Studio", "cancelled", null, address, 40, 6, "Changed plans"],
  ["seedcbb222", other, "Kito Media", "cashed", null, address, 15, 2, "Thanks for the logo"],
  ["seedcbb333", other, "Kito Media", "funded", address, null, 50, 0, "Deposit"],
];
for (const [chequeId, writer, writerName, status, recipientAddress, claimedBy, nim, daysAgo, note] of cheques) {
  const created = new Date(now - daysAgo * DAY);
  const settled = status === "cashed" || status === "cancelled";
  await db.query(
    `INSERT INTO cheques (id, writer_address, writer_name, cheque_address, cheque_public_key, link_public_key, key_ref,
       recipient_tag, recipient_name, recipient_address, amount, currency, fiat_amount, rate, note, status,
       claimed_by_address, claimed_by_name, created_at, funded_at, settled_at)
     VALUES ($1, $2, $3, $4, $5, $5, 'cheque', $6, $7, $8, $9, 'NIM', $10, '1', $11, $12, $13, $14, $15, $15, $16)`,
    [
      chequeId,
      writer,
      writerName,
      randomAddress(),
      "00".repeat(32),
      recipientAddress ? "ada_studio" : null,
      recipientAddress ? "Ada Studio" : null,
      recipientAddress,
      String(nim * 100_000),
      nim.toFixed(5),
      note,
      status,
      claimedBy,
      claimedBy === address ? "Ada Studio" : claimedBy ? "Tunde" : null,
      created,
      settled ? new Date(created.getTime() + 3_600_000) : null,
    ],
  );
}

console.log(`Seeded ${n} invoices and ${cheques.length} cheques for ${address}`);
await db.close();
