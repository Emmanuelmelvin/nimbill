// Checks the invoice.expired and invoice.payment_issue webhooks: when a store invoice expires (only
// once no price lock can still be paid), that an expired invoice takes no new price, why a NIM
// payment didn't pay an invoice, one event per transaction, the payload, and the sweep.
// Runs against an in-memory PGlite, never .data or a real database. The Nimiq RPC is a stand-in on
// localhost that can be switched off, so nothing leaves this machine.
// Run: npm run test:webhook-events
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema.ts";
import type { NimTx } from "../src/lib/clients/nimiq.ts";

delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

// A stand-in Nimiq RPC: no transactions when up, 503 when down.
let rpcUp = false;
let rpcTxs: unknown[] = [];
const rpc = createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    res.writeHead(rpcUp ? 200 : 503, { "content-type": "application/json" });
    res.end(rpcUp ? JSON.stringify({ jsonrpc: "2.0", id: 1, result: { data: rpcTxs } }) : "{}");
  });
});
await new Promise<void>((r) => rpc.listen(0, "127.0.0.1", r));
process.env.NIMIQ_RPC_URL = `http://127.0.0.1:${(rpc.address() as AddressInfo).port}`;

// Hand getDb() an in-memory database through its connection cache (see src/lib/db/index.ts).
const client = new PGlite();
(globalThis as Record<string, unknown>).__nimbillConn = Promise.resolve({
  db: drizzle(client, { schema }),
  migrate: async (sql: string) => void (await client.exec(sql)),
});

const { getDb } = await import("../src/lib/db/index.ts");
const { createQuote, nimPaymentIssue, paymentMemo, scanNimPaymentIssues } = await import("../src/lib/invoices.ts");
const { saveEndpoint } = await import("../src/lib/webhooks.ts");
const { recordInvoicePaid, recordPaymentIssue } = await import("../src/lib/webhooks.ts");
const { buildPayload, sweepMissedEvents } = await import("../src/lib/webhook-delivery.ts");
const { expireStoreInvoices } = await import("../src/lib/webhook-watch.ts");
const { WATCH_AFTER_LOCK_MIN } = await import("../src/lib/webhook-policy.ts");
const { BoardInvoiceBody } = await import("../src/lib/schemas.ts");

const db = await getDb();
const MIN = 60_000;
const merchant = "NQ00 TEST 0000 0000 0000 0000 0000 0000 0000";
await db.insert(schema.merchants).values({ address: merchant, name: "Test shop" });
const { endpoint } = await saveEndpoint(merchant, { url: "https://shop.example.com/hook" });
const now = Date.now();
const at = (ms: number) => new Date(now + ms);

let n = 0;
async function invoice(v: Partial<typeof schema.invoices.$inferInsert> = {}) {
  const [row] = await db
    .insert(schema.invoices)
    .values({
      id: `inv${++n}`,
      number: `NMN-${n}`,
      merchantAddress: merchant,
      merchantName: "Test shop",
      clientName: "Shopper",
      items: [{ description: "Mug", quantity: 1, unitPrice: 10 }],
      currency: "USD",
      total: "10.00",
      source: "board",
      integrationId: endpoint.id,
      createdAt: at(-60 * MIN),
      ...v,
    })
    .returning();
  return row;
}
async function quote(invoiceId: string, createdAt: Date, amount = "1000000", asset: "NIM" | "USDT" = "NIM") {
  const [q] = await db
    .insert(schema.quotes)
    .values({ id: `q${++n}`, invoiceId, asset, amount, rate: "0.01", createdAt, expiresAt: new Date(createdAt.getTime() + 5 * MIN) })
    .returning();
  return q;
}
const events = (invoiceId: string, type?: schema.WebhookEventType) =>
  db
    .select()
    .from(schema.webhookEvents)
    .where(
      type
        ? and(eq(schema.webhookEvents.invoiceId, invoiceId), eq(schema.webhookEvents.type, type))
        : eq(schema.webhookEvents.invoiceId, invoiceId),
    );
const status = async (id: string) => (await db.select().from(schema.invoices).where(eq(schema.invoices.id, id)))[0].status;

// ---- the migration: one index for once-per-invoice and once-per-transaction ----
const idx = await client.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes WHERE tablename = 'webhook_events'`);
const names = idx.rows.map((r) => r.indexname);
assert.ok(names.includes("webhook_events_once_tx_idx"), "new unique index exists");
assert.ok(!names.includes("webhook_events_once_idx"), "old one-per-invoice index is gone");
console.log("PASS migration: unique (type, invoice_id, tx_hash)");

// ---- expiresInMinutes: only within 15 minutes .. 3 days ----
const body = { payerName: "Shop", amount: 10, currency: "USD", description: "Mug" };
assert.equal(BoardInvoiceBody.parse({ ...body, expiresInMinutes: 60 }).expiresInMinutes, 60);
assert.throws(() => BoardInvoiceBody.parse({ ...body, expiresInMinutes: 5 }), /at least 15/);
assert.throws(() => BoardInvoiceBody.parse({ ...body, expiresInMinutes: 5000 }), /at most 4320/);
console.log("PASS expiresInMinutes is limited to 15 minutes .. 3 days");

// ---- expiry ----
const noLock = await invoice({ expiresAt: at(-1 * MIN) });
const lockedRecently = await invoice({ expiresAt: at(-1 * MIN) });
await quote(lockedRecently.id, at(-10 * MIN)); // lock ended 5 min ago: a payment can still show up
const lockedLongAgo = await invoice({ expiresAt: at(-1 * MIN) });
await quote(lockedLongAgo.id, at(-(WATCH_AFTER_LOCK_MIN + 10) * MIN)); // window closed
const notYet = await invoice({ expiresAt: at(30 * MIN) });
const unsigned = await invoice({ integrationId: null, expiresAt: at(-1 * MIN) });
const alreadyPaid = await invoice({ expiresAt: at(-1 * MIN), status: "paid", paidTxHash: "aa".repeat(32) });

// The chain can't be read: only the invoice that was never locked (so can't have been paid) expires.
assert.equal(await expireStoreInvoices(), 1, "chain down: only the never-locked invoice expires");
assert.equal(await status(noLock.id), "expired", "past expiry, never locked: expired");
assert.equal(await status(lockedLongAgo.id), "unpaid", "chain down: a locked invoice waits for the last check");
console.log("PASS an RPC outage never expires an invoice that had a price lock");

rpcUp = true;
assert.equal(await expireStoreInvoices(), 1, "chain back: the locked one expires too");
assert.equal(await status(lockedLongAgo.id), "expired", "past expiry, lock window over, chain checked: expired");
assert.equal(await status(lockedRecently.id), "unpaid", "a lock that can still be paid holds expiry back");
assert.equal(await status(notYet.id), "unpaid", "not past expiry yet");
assert.equal(await status(unsigned.id), "unpaid", "only store invoices expire");
assert.equal(await status(alreadyPaid.id), "paid", "a paid invoice never becomes expired");
assert.equal((await events(noLock.id, "invoice.expired")).length, 1, "invoice.expired queued");
assert.equal((await events(lockedLongAgo.id, "invoice.expired")).length, 1);
assert.equal((await events(alreadyPaid.id)).length, 0, "no event for the paid one");
assert.equal(await expireStoreInvoices(), 0, "running again changes nothing");
assert.equal((await events(noLock.id)).length, 1, "still one event");
console.log("PASS invoices expire only once no price lock can still be paid, with one invoice.expired");

// No new price for an expired invoice, or one past its expiry the worker hasn't reached yet.
const [expiredRow] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, noLock.id));
await assert.rejects(createQuote(expiredRow, "NIM"), /has expired/);
await assert.rejects(createQuote({ ...lockedRecently, expiresAt: at(-1) }, "NIM"), /has expired/);
console.log("PASS an expired invoice takes no new price");

// The payload carries expiresAt and status.
const [expEv] = await events(noLock.id, "invoice.expired");
const expPayload = (await buildPayload(expEv))!;
assert.equal(expPayload.type, "invoice.expired");
assert.equal(expPayload.data.invoice.status, "expired");
assert.equal(expPayload.data.invoice.expiresAt, noLock.expiresAt!.toISOString());
assert.equal(expPayload.data.issue, undefined);
console.log("PASS invoice.expired payload");

// The sweep re-queues a missing invoice.expired, and the paid invoice's missing invoice.paid.
await db.delete(schema.webhookEvents).where(eq(schema.webhookEvents.invoiceId, lockedLongAgo.id));
assert.equal(await sweepMissedEvents(), 2, "missing invoice.expired and invoice.paid re-queued");
assert.equal((await events(lockedLongAgo.id, "invoice.expired")).length, 1);
assert.equal((await events(alreadyPaid.id, "invoice.paid")).length, 1);
assert.equal((await events(unsigned.id)).length, 0, "nothing for invoices the store didn't make");
assert.equal(await sweepMissedEvents(), 0, "nothing more to add");
console.log("PASS sweep re-queues a missing invoice.expired / invoice.paid");

// ---- payment issues ----
const memoHex = (id: string) => Buffer.from(paymentMemo(id)).toString("hex");
let h = 0;
const tx = (inv: { id: string }, value: number, timestamp: number, v: Partial<NimTx> = {}): NimTx => ({
  hash: (++h).toString(16).padStart(64, "0"),
  blockNumber: 1,
  timestamp,
  confirmations: 10,
  from: "NQ11 PAYER",
  to: merchant,
  value,
  recipientData: memoHex(inv.id),
  executionResult: true,
  ...v,
});

const open = await invoice();
const q1 = await quote(open.id, at(-2 * MIN), "1000000");
const qs = [q1];
const inLock = now - 1 * MIN;

assert.equal(nimPaymentIssue(open, qs, tx(open, 1_000_000, inLock)), null, "a payment that pays is not an issue");
assert.equal(nimPaymentIssue(open, qs, tx(open, 2_000_000, inLock)), null, "paying more still pays");
assert.deepEqual(nimPaymentIssue(open, qs, tx(open, 999_999, inLock)), { reason: "amount_too_low", lockedAmount: "1000000" });
assert.deepEqual(nimPaymentIssue(open, qs, tx(open, 1_000_000, now + 60 * MIN)), { reason: "price_lock_expired", lockedAmount: null });
assert.deepEqual(
  nimPaymentIssue(open, [], tx(open, 1_000_000, inLock)),
  { reason: "price_lock_expired", lockedAmount: null },
  "never locked",
);
assert.equal(nimPaymentIssue(open, qs, tx(open, 1, inLock, { recipientData: memoHex("other") })), null, "another invoice's memo");
assert.equal(nimPaymentIssue(open, qs, tx(open, 1, inLock, { to: "NQ99 SOMEONE ELSE" })), null, "sent to someone else");
assert.equal(nimPaymentIssue(open, qs, tx(open, 1, inLock, { executionResult: false })), null, "failed on-chain");

const paidTx = tx(open, 1_000_000, inLock);
const paidInv = { ...open, status: "paid" as const, paidTxHash: paidTx.hash };
assert.equal(nimPaymentIssue(paidInv, qs, paidTx), null, "the transaction that paid it is not an issue");
assert.deepEqual(nimPaymentIssue(paidInv, qs, tx(open, 1_000_000, inLock)), { reason: "already_paid", lockedAmount: null });
assert.deepEqual(nimPaymentIssue({ ...open, status: "expired" }, qs, tx(open, 1_000_000, inLock)), {
  reason: "invoice_closed",
  lockedAmount: null,
});
assert.deepEqual(nimPaymentIssue({ ...open, status: "cancelled" }, qs, tx(open, 1_000_000, inLock)), {
  reason: "invoice_closed",
  lockedAmount: null,
});
console.log("PASS payment issue reasons: too low, lock expired, already paid, invoice closed");

// One invoice.payment_issue per transaction, however often it is seen; invoice.paid stays one per invoice.
const issue = (txHash: string) => ({
  reason: "amount_too_low" as const,
  asset: "NIM" as const,
  amount: "999999",
  lockedAmount: "1000000",
  txHash,
  from: "NQ11 PAYER",
  sentAt: new Date(inLock).toISOString(),
});
await recordPaymentIssue(open, issue("01".repeat(32)));
await recordPaymentIssue(open, issue("01".repeat(32)));
await recordPaymentIssue(open, issue("02".repeat(32)));
assert.equal((await events(open.id, "invoice.payment_issue")).length, 2, "two transactions, two events");
await recordInvoicePaid(open);
await recordInvoicePaid(open);
assert.equal((await events(open.id, "invoice.paid")).length, 1, "invoice.paid once");
await recordPaymentIssue(unsigned, issue("03".repeat(32)));
assert.equal((await events(unsigned.id)).length, 0, "invoices not made by the store send nothing");
console.log("PASS one invoice.payment_issue per transaction, invoice.paid once per invoice");

const [issueEv] = (await events(open.id, "invoice.payment_issue")).filter((e) => e.txHash === "01".repeat(32));
const issuePayload = (await buildPayload(issueEv))!;
assert.equal(issuePayload.type, "invoice.payment_issue");
assert.deepEqual(issuePayload.data.issue, issue("01".repeat(32)));
assert.equal(issuePayload.data.invoice.id, open.id);
console.log("PASS invoice.payment_issue payload carries the transaction");

// The worker's scan reads the chain and reports a short payment once, however often it runs.
const shortPaid = await invoice();
await quote(shortPaid.id, at(-2 * MIN), "1000000");
rpcTxs = [tx(shortPaid, 400_000, inLock), tx(shortPaid, 1, inLock, { recipientData: memoHex("unrelated") })];
assert.equal(await scanNimPaymentIssues(merchant, [shortPaid.id]), 1, "one short payment found");
await scanNimPaymentIssues(merchant, [shortPaid.id]);
const found = await events(shortPaid.id, "invoice.payment_issue");
assert.equal(found.length, 1, "still one event after a second scan");
assert.equal(found[0].issue?.reason, "amount_too_low");
assert.equal(found[0].issue?.amount, "400000");
console.log("PASS the worker scan finds a short NIM payment on-chain and reports it once");

rpc.close();
console.log("\nAll webhook event checks passed");
