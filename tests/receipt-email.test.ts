// Checks the cap on requested receipt emails (claimReceiptEmail in src/lib/invoices.ts), which keeps
// the public POST /api/invoices/[id]/receipt from sending unlimited emails to arbitrary addresses.
// Runs against an in-memory PGlite, never .data or a real database, and sends no email.
// Run: bun test tests/receipt-email.test.ts
import { test } from "bun:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema.ts";
import { memoryDb } from "./memory-db.ts";

memoryDb();

const { getDb } = await import("../src/lib/db/index.ts");
const { claimReceiptEmail, createInvoice } = await import("../src/lib/invoices.ts");

const db = await getDb();
const merchant = "NQ00 TEST 0000 0000 0000 0000 0000 0000 0000";
await db.insert(schema.merchants).values({ address: merchant, name: "Test studio" });
const newInvoice = () =>
  createInvoice({
    merchantAddress: merchant,
    merchantName: "Test studio",
    clientName: "Acme",
    items: [{ description: "Work", quantity: 1, unitPrice: 50 }],
    currency: "USD",
  });
const markPaid = (id: string) => db.update(schema.invoices).set({ status: "paid", paidAt: new Date() }).where(eq(schema.invoices.id, id));

const check = (name: string, fn: () => Promise<void>) => test(name, fn);

check("an unpaid invoice can't have its receipt emailed", async () => {
  const inv = await newInvoice();
  assert.equal(await claimReceiptEmail(inv.id, "a@example.com", 3), null);
});

check("a paid invoice allows up to the cap, then refuses", async () => {
  const inv = await newInvoice();
  await markPaid(inv.id);
  for (let i = 1; i <= 3; i++) {
    const claimed = await claimReceiptEmail(inv.id, `payer${i}@example.com`, 3);
    assert.ok(claimed);
    assert.equal(claimed.receiptEmailsSent, i);
    assert.equal(claimed.payerEmail, `payer${i}@example.com`);
  }
  assert.equal(await claimReceiptEmail(inv.id, "another@example.com", 3), null);
});

check("parallel requests can't get past the cap", async () => {
  const inv = await newInvoice();
  await markPaid(inv.id);
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => claimReceiptEmail(inv.id, `x${i}@example.com`, 3)));
  assert.equal(results.filter(Boolean).length, 3);
  const [row] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, inv.id));
  assert.equal(row.receiptEmailsSent, 3);
});
