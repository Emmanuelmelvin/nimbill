// Checks that a withdrawal's status only moves on from the status it was read with (setStatus in
// src/lib/withdraw/service.ts), so overlapping updates from the worker, the status screen, the
// history list and the cancel call can't move it backwards. Runs against an in-memory PGlite,
// never .data or a real database, and calls no provider.
// Run: npm run test:withdraw-status
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema.ts";

delete process.env.DATABASE_URL;

// Hand getDb() an in-memory database through its connection cache (see src/lib/db/index.ts).
const client = new PGlite();
(globalThis as Record<string, unknown>).__nimbillConn = Promise.resolve({
  db: drizzle(client, { schema }),
  migrate: async (sql: string) => void (await client.exec(sql)),
});

const { getDb } = await import("../src/lib/db/index.ts");
const { setStatus } = await import("../src/lib/withdraw/service.ts");

const db = await getDb();
const t = schema.withdrawals;
let n = 0;
const insert = async (status: schema.Withdrawal["status"]) => {
  const now = new Date();
  const [row] = await db
    .insert(t)
    .values({
      id: `wd_test${++n}`,
      nimiqAddress: "NQ00 TEST 0000 0000 0000 0000 0000 0000 0000",
      payWith: "NIM",
      chain: "polygon",
      asset: "USDC",
      destination: "0x0000000000000000000000000000000000000001",
      receiveAmount: "10000000",
      status,
      statusHistory: [{ status, at: now.toISOString() }],
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
};
const current = async (id: string) => (await db.select().from(t).where(eq(t.id, id)))[0];

let passed = 0;
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
};

await check("a normal move from the status read goes through", async () => {
  const w = await insert("swapping");
  const moved = await setStatus(w, "delivering");
  assert.equal(moved.status, "delivering");
  assert.equal((await current(w.id)).status, "delivering");
});

await check("a stale update can't move a delivered withdrawal backwards", async () => {
  const stale = await insert("delivering");
  await setStatus(stale, "delivered", { destinationTxHash: "0xabc" });
  const result = await setStatus(stale, "delivering"); // a slower process that read "delivering" earlier
  assert.equal(result.status, "delivered");
  assert.equal((await current(stale.id)).status, "delivered");
});

await check("a late cancel can't overwrite a withdrawal that moved on", async () => {
  const stale = await insert("quoted");
  await setStatus(stale, "swapping"); // the worker saw the payment first
  const result = await setStatus(stale, "cancelled", {}, "Cancelled in Nimiq Pay.");
  assert.equal(result.status, "swapping");
  assert.equal((await current(stale.id)).failureReason ?? null, null);
});

await check("of two overlapping updates from the same status, exactly one wins", async () => {
  const w = await insert("delivering");
  const [a, b] = await Promise.all([setStatus(w, "delivered"), setStatus(w, "failed", {}, "chain says failed")]);
  const final = (await current(w.id)).status;
  assert.ok(final === "delivered" || final === "failed");
  assert.equal(a.status, final);
  assert.equal(b.status, final);
  assert.equal((await current(w.id)).statusHistory.length, 2);
});

console.log(`\n${passed} withdrawal status checks passed`);
process.exit(0);
