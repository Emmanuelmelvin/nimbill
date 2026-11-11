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

// [days ago, client, currency, total, paid in, value in USD]
const paid: [number, string, string, number, "NIM" | "USDT", number][] = [
  [0.1, "Lagos Bakery", "NGN", 45_000, "USDT", 30],
  [1, "Acme Ltd", "USD", 120, "NIM", 120],
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
for (const [ago, client, currency, total, asset, usd] of paid) {
  const invoiceId = id();
  const at = new Date(now - ago * DAY);
  const coins = asset === "NIM" ? usd / NIM_USD : usd;
  await db.query(
    `INSERT INTO invoices (id, number, merchant_address, merchant_name, client_name, items, currency, total, status, created_at,
       paid_asset, paid_amount, paid_rate, paid_tx_hash, paid_from, paid_at, paid_usd)
     VALUES ($1, $2, $3, 'Ada Studio', $4, $5, $6, $7, 'paid', $8, $9, $10, $11, $12, $13, $14, $15)`,
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
      String(total / coins),
      (asset === "NIM" ? "" : "0x") + invoiceId.padEnd(64, "0"),
      "seed-payer",
      at,
      // Two rows have no dollar value yet, like payments from before the column existed (see backfill in lib/ledger.ts).
      n === 5 || n === 12 ? null : usd.toFixed(6),
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

console.log(`Seeded ${n} invoices for ${address}`);
await db.close();
