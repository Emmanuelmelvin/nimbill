// "Pay from another chain" (src/lib/payin): refund address checks, amounts, 1Click's refusals, and
// how a payment moves through its statuses. Runs against an in-memory PGlite, never .data or a
// real database. 1Click is a stand-in on localhost, so nothing leaves this machine.
// Run: bun test tests/payin.test.ts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema.ts";
import { memoryDb } from "./memory-db.ts";

memoryDb();

// A stand-in 1Click: GET /v0/status answers with whatever `statusFor` holds for the depositAddress, or 404.
const statusFor = new Map<string, unknown>();
const oneclick = createServer((req, res) => {
  req.resume();
  const addr = new URL(req.url ?? "/", "http://x").searchParams.get("depositAddress") ?? "";
  const body = statusFor.get(addr);
  res.writeHead(body ? 200 : 404, { "content-type": "application/json" });
  res.end(JSON.stringify(body ?? { message: "Deposit address not found" }));
});
await new Promise<void>((r) => oneclick.listen(0, "127.0.0.1", r));
const previousUrl = process.env.ONECLICK_API_URL;
process.env.ONECLICK_API_URL = `http://127.0.0.1:${(oneclick.address() as AddressInfo).port}`;
afterAll(() => {
  oneclick.close();
  if (previousUrl === undefined) delete process.env.ONECLICK_API_URL;
  else process.env.ONECLICK_API_URL = previousUrl;
});

const { PAYIN_SOURCES, checkRefundAddress, formatUnits, getPayinSource, roundUpTo } = await import("../src/lib/payin/sources.ts");
const { readableRefusal } = await import("../src/lib/payin/oneclick.ts");
const { advancePayin, publicPayin, statusFrom } = await import("../src/lib/payin/service.ts");
const { getDb } = await import("../src/lib/db/index.ts");

const tron = getPayinSource("tron-usdt")!;
const bnb = getPayinSource("bnb-usdt")!;
const sol = getPayinSource("solana-usdt")!;

test("refund addresses: right chain accepted, wrong chain or typo refused", () => {
  assert.equal(checkRefundAddress(tron, " TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t ").ok, true);
  assert.equal(checkRefundAddress(tron, "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u").ok, false, "Tron checksum");
  assert.equal(checkRefundAddress(tron, "0x8ba1f109551bD432803012645Ac136ddd64DBA72").ok, false);
  const evm = checkRefundAddress(bnb, "0x8ba1f109551bd432803012645ac136ddd64dba72");
  assert.deepEqual(evm, { ok: true, address: "0x8ba1f109551bD432803012645Ac136ddd64DBA72" });
  assert.equal(checkRefundAddress(bnb, "0x8BA1f109551bD432803012645Ac136ddd64DBA72").ok, false, "EIP-55 checksum");
  assert.equal(checkRefundAddress(bnb, "0x0000000000000000000000000000000000000000").ok, false);
  assert.equal(checkRefundAddress(bnb, "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t").ok, false);
  assert.equal(checkRefundAddress(sol, "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB").ok, true);
  assert.equal(checkRefundAddress(sol, "0x8ba1f109551bD432803012645Ac136ddd64DBA72").ok, false);
  assert.equal(checkRefundAddress(sol, "").ok, false);
});

// A base58check address with this version byte, built here independently of the code under test.
function base58Check(version: number, seed: number): string {
  const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const payload = Buffer.concat([Buffer.from([version]), Buffer.alloc(20, seed)]);
  const sum = createHash("sha256").update(createHash("sha256").update(payload).digest()).digest();
  const full = Buffer.concat([payload, sum.subarray(0, 4)]);
  let n = BigInt(`0x${full.toString("hex")}`);
  let out = "";
  while (n > BigInt(0)) {
    out = A[Number(n % BigInt(58))] + out;
    n /= BigInt(58);
  }
  for (const b of full) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

test("refund addresses on Bitcoin, Litecoin and Dogecoin", () => {
  const btc = getPayinSource("bitcoin-btc")!;
  const ltc = getPayinSource("litecoin-ltc")!;
  const doge = getPayinSource("dogecoin-doge")!;
  // Legacy, segwit v0 (BIP-173) and taproot (BIP-350) examples.
  assert.equal(checkRefundAddress(btc, "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa").ok, true);
  assert.equal(checkRefundAddress(btc, "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy").ok, true);
  assert.deepEqual(checkRefundAddress(btc, "BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4"), {
    ok: true,
    address: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
  });
  assert.equal(checkRefundAddress(btc, "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0").ok, true);
  assert.equal(checkRefundAddress(btc, "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5").ok, false, "bech32 checksum");
  assert.equal(checkRefundAddress(btc, "bc1qw508d6qejxtdg4y5r3zarvaRy0c5xw7kv8f3t4").ok, false, "mixed case");
  assert.equal(checkRefundAddress(btc, "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb").ok, false, "base58 checksum");
  assert.equal(checkRefundAddress(btc, "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t").ok, false, "a Tron address");
  assert.equal(checkRefundAddress(btc, base58Check(0x30, 7)).ok, false, "a Litecoin address");

  assert.equal(checkRefundAddress(ltc, base58Check(0x30, 7)).ok, true, "L…");
  assert.equal(checkRefundAddress(ltc, base58Check(0x32, 7)).ok, true, "M…");
  assert.equal(checkRefundAddress(ltc, "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4").ok, false, "a Bitcoin segwit address");
  assert.equal(checkRefundAddress(ltc, "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa").ok, false);

  assert.equal(checkRefundAddress(doge, base58Check(0x1e, 9)).ok, true, "D…");
  assert.equal(checkRefundAddress(doge, base58Check(0x00, 9)).ok, false, "a Bitcoin address");
});

test("every coin has a sane buffer, time to send and rounding", () => {
  for (const s of PAYIN_SOURCES) {
    assert.ok(s.showDecimals <= s.decimals, s.id);
    assert.ok(s.slippageBps >= 50 && s.slippageBps <= 300, s.id);
    assert.ok(s.depositWindowMin >= 15 && s.depositWindowMin <= 60, s.id);
    if (s.kind === "native") assert.ok(s.slippageBps >= 200, `${s.id}: a coin whose price moves needs a bigger buffer`);
  }
  assert.equal(new Set(PAYIN_SOURCES.map((s) => s.id)).size, PAYIN_SOURCES.length, "ids are unique");
});

test("amounts: rounded up to the cent, shown without trailing zeros", () => {
  assert.equal(roundUpTo("150792499", 6, 2), "150800000");
  assert.equal(roundUpTo("150800000", 6, 2), "150800000");
  assert.equal(roundUpTo("150798308860246776530", 18, 2), "150800000000000000000");
  assert.equal(roundUpTo("255211", 8, 6), "255300", "BTC to 6 decimals");
  assert.equal(roundUpTo("2175288518", 9, 4), "2175300000", "SOL to 4 decimals");
  assert.equal(formatUnits("255300", 8), "0.002553");
  assert.equal(formatUnits("150800000", 6), "150.8");
  assert.equal(formatUnits("150800000000000000000", 18), "150.8");
  assert.equal(formatUnits("150000000", 6), "150");
  assert.equal(formatUnits("4321", 6), "0.004321");
});

test("1Click's refusals become something the client can act on", () => {
  assert.match(readableRefusal("Temporary swap limits: minimum swap amount is $100"), /at least \$100/);
  assert.match(readableRefusal("Amount is too low for bridge"), /too small/);
  assert.match(readableRefusal("something new"), /Nimiq Pay/);
});

test("1Click's statuses map to ours; SUCCESS is not paid until Polygon is checked", () => {
  assert.equal(statusFrom("PENDING_DEPOSIT"), "awaiting_deposit");
  assert.equal(statusFrom("INCOMPLETE_DEPOSIT"), "incomplete");
  assert.equal(statusFrom("KNOWN_DEPOSIT_TX"), "swapping");
  assert.equal(statusFrom("PROCESSING"), "swapping");
  assert.equal(statusFrom("SUCCESS"), "swapping");
  assert.equal(statusFrom("REFUNDED"), "refunded");
  assert.equal(statusFrom("FAILED"), "failed");
});

// ---------- advancing a payment ----------

const db = await getDb();
const merchant = "NQ00 TEST 0000 0000 0000 0000 0000 0000 0000";
const merchantEvm = "0x8ba1f109551bD432803012645Ac136ddd64DBA72";
let n = 0;

async function setup(invoice: Partial<typeof schema.invoices.$inferInsert> = {}, payin: Partial<typeof schema.payins.$inferInsert> = {}) {
  const i = ++n;
  const now = Date.now();
  await db.insert(schema.invoices).values({
    id: `inv${i}`,
    number: `INV-${i}`,
    merchantAddress: merchant,
    merchantName: "Ada",
    merchantEvmAddress: merchantEvm,
    clientName: "Client",
    items: [{ description: "Work", quantity: 1, unitPrice: 150 }],
    currency: "USD",
    total: "150.00",
    ...invoice,
  });
  await db.insert(schema.quotes).values({
    id: `q${i}`,
    invoiceId: `inv${i}`,
    asset: "USDT",
    amount: "150004321",
    rate: "1",
    expiresAt: new Date(now + 50 * 60_000),
  });
  const [row] = await db
    .insert(schema.payins)
    .values({
      id: `pi_${i}`,
      invoiceId: `inv${i}`,
      quoteId: `q${i}`,
      sourceId: "tron-usdt",
      refundTo: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      depositAddress: `Tdeposit${i}`,
      sendAmount: "150800000",
      receiveAmount: "150004321",
      deadline: new Date(now + 30 * 60_000),
      ...payin,
    })
    .returning();
  return row;
}

const status = (s: string, details: Record<string, unknown> = {}) => ({
  status: s,
  updatedAt: new Date().toISOString(),
  swapDetails: { originChainTxHashes: [], destinationChainTxHashes: [], ...details },
});

test("waiting, part paid, then refunded: each step is saved, the refund amount too", async () => {
  const p = await setup();
  statusFor.set(p.depositAddress, status("PENDING_DEPOSIT"));
  let next = await advancePayin(p);
  assert.equal(next.status, "awaiting_deposit");
  assert.ok(next.checkedAt);

  statusFor.set(p.depositAddress, status("INCOMPLETE_DEPOSIT", { originChainTxHashes: [{ hash: "abc123" }] }));
  next = await advancePayin(next);
  assert.equal(next.status, "incomplete");
  assert.equal(next.depositTxHash, "abc123");
  assert.match(publicPayin(next).message, /Send the rest/);

  statusFor.set(p.depositAddress, status("REFUNDED", { refundedAmount: "50000000" }));
  next = await advancePayin(next);
  assert.equal(next.status, "refunded");
  assert.equal(publicPayin(next).refundedAmount, "50");

  // Finished: nothing is asked of 1Click any more.
  statusFor.delete(p.depositAddress);
  assert.equal((await advancePayin(next)).status, "refunded");
});

test("nothing sent: expired only well after the deadline", async () => {
  const p = await setup({}, { deadline: new Date(Date.now() - 2 * 3600_000) });
  statusFor.set(p.depositAddress, status("PENDING_DEPOSIT"));
  assert.equal((await advancePayin(p, p.deadline.getTime() + 10 * 60_000)).status, "awaiting_deposit");
  assert.equal((await advancePayin(p)).status, "expired");

  // 1Click doesn't know the address at all: same rule.
  const q = await setup({}, { deadline: new Date(Date.now() - 2 * 3600_000) });
  assert.equal((await advancePayin(q)).status, "expired");
});

test("paid out to a cancelled invoice: recorded as delivered, the invoice stays cancelled", async () => {
  const p = await setup({ status: "cancelled" });
  statusFor.set(p.depositAddress, status("SUCCESS", { destinationChainTxHashes: [{ hash: `0x${"ab".repeat(32)}` }] }));
  const next = await advancePayin(p);
  assert.equal(next.status, "delivered_unmatched");
  assert.equal(next.payoutTxHash, `0x${"ab".repeat(32)}`);
  const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, p.invoiceId));
  assert.equal(inv.status, "cancelled");
});

test("paid out after the invoice was paid another way: not counted twice", async () => {
  const p = await setup({ status: "paid", paidAsset: "NIM", paidTxHash: "f".repeat(64), paidAmount: "1", paidAt: new Date() });
  statusFor.set(p.depositAddress, status("SUCCESS", { destinationChainTxHashes: [{ hash: `0x${"cd".repeat(32)}` }] }));
  const next = await advancePayin(p);
  assert.equal(next.status, "delivered_unmatched");
  const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, p.invoiceId));
  assert.equal(inv.paidTxHash, "f".repeat(64));
});

test("a stale check can't move a finished payment backwards", async () => {
  const p = await setup();
  statusFor.set(p.depositAddress, status("REFUNDED"));
  await advancePayin(p);
  statusFor.set(p.depositAddress, status("PROCESSING"));
  const stale = await advancePayin(p); // `p` was read while it was still awaiting_deposit
  assert.equal(stale.status, "refunded");
});
