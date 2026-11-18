// Checks the recurring schedule lifecycle against the database (src/lib/recurring.ts): the first
// cycle, the worker's claim (no double invoices when runs overlap), "issue now", resume, and the
// client's unsubscribe link. Runs against an in-memory PGlite, never .data or a real database, and
// sends no email.
// Run: npm run test:recurring-lifecycle
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema.ts";

delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

// Hand getDb() an in-memory database through its connection cache (see src/lib/db/index.ts).
const client = new PGlite();
(globalThis as Record<string, unknown>).__nimbillConn = Promise.resolve({
  db: drizzle(client, { schema }),
  migrate: async (sql: string) => void (await client.exec(sql)),
});

const { getDb } = await import("../src/lib/db/index.ts");
const rec = await import("../src/lib/recurring.ts");

const db = await getDb();
const t = schema.recurringInvoices;
const merchant = "NQ00 TEST 0000 0000 0000 0000 0000 0000 0000";
await db.insert(schema.merchants).values({ address: merchant, name: "Test studio" });

const today = rec.todayDate();
const base = {
  merchantAddress: merchant,
  merchantName: "Test studio",
  clientName: "Acme",
  clientEmail: "billing@acme.example",
  items: [{ description: "Retainer", quantity: 1, unitPrice: 100 }],
  currency: "USD",
  dueDays: 7,
};
const invoicesFor = async (id: string) => db.select().from(schema.invoices).where(eq(schema.invoices.recurringId, id));
const get = async (id: string) => (await rec.getRecurringInvoice(id))!;
const setNext = (id: string, nextRunDate: string) => db.update(t).set({ nextRunDate }).where(eq(t.id, id));

let passed = 0;
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
};

await check("starting today issues the first invoice and stores the anchor day", async () => {
  const { recurring, invoice } = await rec.createRecurringInvoice({ ...base, interval: "monthly" });
  assert.ok(invoice);
  assert.equal(invoice.recurringId, recurring.id);
  assert.equal(recurring.generatedCount, 1);
  assert.equal(recurring.anchorDay, rec.dayOfMonth(today));
  assert.equal(recurring.nextRunDate, rec.addInterval(today, "monthly", recurring.anchorDay));
});

await check("a future start date issues nothing yet", async () => {
  const start = rec.addDaysToDate(today, 10);
  const { recurring, invoice } = await rec.createRecurringInvoice({ ...base, interval: "weekly", startDate: start });
  assert.equal(invoice, null);
  assert.equal(recurring.nextRunDate, start);
  assert.equal(recurring.generatedCount, 0);
});

await check("overlapping worker runs issue a due cycle exactly once", async () => {
  const { recurring } = await rec.createRecurringInvoice({ ...base, interval: "weekly" });
  await setNext(recurring.id, today);
  await Promise.all([rec.advanceDueRecurring(merchant), rec.advanceDueRecurring(merchant), rec.advanceDueRecurring()]);
  const after = await get(recurring.id);
  assert.equal((await invoicesFor(recurring.id)).length, 2); // the first cycle + this one
  assert.equal(after.generatedCount, 2);
  assert.ok(after.nextRunDate > today);
});

await check("missed cycles catch up with one invoice and keep the anchor day", async () => {
  const { recurring } = await rec.createRecurringInvoice({ ...base, interval: "monthly" });
  // Pretend the schedule began on a 31st and the worker was down for about three months.
  const past = rec.addDaysToDate(today, -95);
  await db.update(t).set({ nextRunDate: past, anchorDay: 31 }).where(eq(t.id, recurring.id));
  await rec.advanceDueRecurring(merchant);
  const after = await get(recurring.id);
  assert.equal((await invoicesFor(recurring.id)).length, 2);
  assert.equal(after.nextRunDate, rec.nextFutureDate(past, "monthly", today, 31));
  assert.ok(after.nextRunDate > today);
});

await check("issue now bills the upcoming cycle and moves the schedule past it", async () => {
  const start = rec.addDaysToDate(today, 5);
  const { recurring } = await rec.createRecurringInvoice({ ...base, interval: "weekly", startDate: start });
  const { recurring: after, invoice } = await rec.updateRecurringSchedule(recurring.id, merchant, "issue_now");
  assert.ok(invoice);
  assert.equal(after.nextRunDate, rec.addInterval(start, "weekly"));
  assert.equal(after.generatedCount, 1);
  // The original date is no longer due, so the worker doesn't bill that period again.
  await setNext(recurring.id, after.nextRunDate);
  await rec.advanceDueRecurring(merchant);
  assert.equal((await invoicesFor(recurring.id)).length, 1);
});

await check("issue now racing the worker on a due cycle issues it once", async () => {
  const { recurring } = await rec.createRecurringInvoice({ ...base, interval: "weekly" });
  await setNext(recurring.id, today);
  const results = await Promise.allSettled([
    rec.updateRecurringSchedule(recurring.id, merchant, "issue_now"),
    rec.advanceDueRecurring(merchant),
  ]);
  const issueNow = results[0];
  if (issueNow.status === "rejected") assert.match((issueNow.reason as Error).message, /just changed/);
  assert.equal((await invoicesFor(recurring.id)).length, 2); // the first cycle + one for today
});

await check("resume skips cycles missed while paused and keeps the anchor day", async () => {
  const { recurring } = await rec.createRecurringInvoice({ ...base, interval: "monthly" });
  await rec.updateRecurringSchedule(recurring.id, merchant, "pause");
  const past = rec.addDaysToDate(today, -40);
  await db.update(t).set({ nextRunDate: past, anchorDay: 31 }).where(eq(t.id, recurring.id));
  await rec.advanceDueRecurring(merchant); // paused: nothing happens
  assert.equal((await invoicesFor(recurring.id)).length, 1);
  const { recurring: after } = await rec.updateRecurringSchedule(recurring.id, merchant, "resume");
  assert.equal(after.status, "active");
  assert.equal(after.nextRunDate, rec.nextFutureDate(past, "monthly", today, 31));
});

await check("another merchant can't control the schedule", async () => {
  const { recurring } = await rec.createRecurringInvoice({ ...base, interval: "weekly" });
  await assert.rejects(rec.updateRecurringSchedule(recurring.id, "NQ00 SOMEONE ELSE", "cancel"), /not found/i);
});

await check("unsubscribe needs a valid token and cancels once", async () => {
  const { recurring } = await rec.createRecurringInvoice({ ...base, interval: "weekly" });
  await assert.rejects(rec.unsubscribeRecurringSchedule(recurring.id, "0".repeat(32)), /invalid/i);
  const token = rec.recurringUnsubscribeToken(recurring.id);
  const results = await Promise.all([
    rec.unsubscribeRecurringSchedule(recurring.id, token),
    rec.unsubscribeRecurringSchedule(recurring.id, token),
  ]);
  assert.equal(results.filter((r) => !r.alreadyCancelled).length, 1);
  const after = await get(recurring.id);
  assert.equal(after.status, "cancelled");
  assert.equal(after.cancelledBy, "client");
  await assert.rejects(rec.updateRecurringSchedule(recurring.id, merchant, "issue_now"), /cancelled/);
});

console.log(`\n${passed} recurring lifecycle checks passed`);
process.exit(0);
