// Checks the failing-endpoint rules (src/lib/webhook-health.ts): warning after 24 h of failures,
// removal after 5 days and 48 h of notice, reset on success and on saving. Runs against an
// in-memory PGlite, never .data or a real database, and sends no email.
// Run: npm run test:webhook-health
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
const { checkEndpointHealth, recordAttempt, warningEmail, removedEmail } = await import("../src/lib/webhook-health.ts");
const { endpointHealth, getEndpoint, saveEndpoint, webhookAlert } = await import("../src/lib/webhooks.ts");
const { FAILING_MIN_ATTEMPTS, removalDate } = await import("../src/lib/webhook-policy.ts");

const db = await getDb();
const t = schema.webhookEndpoints;
const H = 3_600_000;
const D = 24 * H;
const merchant = "NQ00 TEST 0000 0000 0000 0000 0000 0000 0000";
await db.insert(schema.merchants).values({ address: merchant, name: "Test shop" });
const { endpoint: created, secret } = await saveEndpoint(merchant, { url: "https://shop.example.com/hook" });
assert.ok(secret?.startsWith("whsec_"));
const id = created.id;

const ep = async () => (await getEndpoint(merchant))!;
const set = (v: Partial<typeof t.$inferInsert>) => db.update(t).set(v).where(eq(t.id, id));
const fail = async (n: number) => {
  for (let i = 0; i < n; i++) await recordAttempt(id, false);
};
const now = new Date();
const ago = (ms: number) => new Date(now.getTime() - ms);

// Failures are counted from the first one since the last success.
await fail(3);
let e = await ep();
assert.equal(e.consecutiveFailures, 3);
assert.ok(e.failingSince);
assert.equal(endpointHealth(e, now).state, "failing");
assert.equal(await webhookAlert(merchant), null, "no dashboard alert before the warning");

// A success clears it.
await recordAttempt(id, true);
e = await ep();
assert.equal(e.consecutiveFailures, 0);
assert.equal(e.failingSince, null);
assert.equal(endpointHealth(e, now).state, "ok");

// Not enough attempts: never warned, however long.
await fail(FAILING_MIN_ATTEMPTS - 1);
await set({ failingSince: ago(3 * D) });
assert.deepEqual(await checkEndpointHealth(now), { warned: 0, removed: 0 });

// Enough attempts but under 24 h: not yet.
await fail(1);
await set({ failingSince: ago(23 * H) });
assert.deepEqual(await checkEndpointHealth(now), { warned: 0, removed: 0 });

// 24 h of failures: warned once, never twice.
await set({ failingSince: ago(25 * H) });
assert.deepEqual(await checkEndpointHealth(now), { warned: 1, removed: 0 });
assert.deepEqual(await checkEndpointHealth(now), { warned: 0, removed: 0 });
e = await ep();
const h = endpointHealth(e, now);
assert.equal(h.state, "warned");
assert.equal(h.removeAt, removalDate(e.failingSince!, e.warnedAt, now).toISOString());
// 5 days after it started failing (25 h ago), which is later than 48 h after the warning (now).
assert.equal(new Date(h.removeAt!).getTime(), ago(25 * H).getTime() + 5 * D);
assert.equal((await webhookAlert(merchant))?.state, "warned", "the dashboard shows the warning");

// The warning email names the URL and the removal date.
const w = warningEmail(e, now);
assert.match(w.subject, /will be removed on/);
assert.match(w.text, /https:\/\/shop\.example\.com\/hook/);
assert.match(w.html, /settings#webhooks/);

// Failing 5+ days, but warned only an hour ago: the 48 h notice wins.
await set({ failingSince: ago(6 * D), warnedAt: ago(1 * H) });
assert.deepEqual(await checkEndpointHealth(now), { warned: 0, removed: 0 });
assert.equal(endpointHealth(await ep(), now).removeAt, new Date(ago(1 * H).getTime() + 48 * H).toISOString());

// Failing 5+ days and warned 2+ days ago: removed (turned off, reason kept), once.
await set({ warnedAt: ago(49 * H) });
assert.deepEqual(await checkEndpointHealth(now), { warned: 0, removed: 1 });
assert.deepEqual(await checkEndpointHealth(now), { warned: 0, removed: 0 });
e = await ep();
assert.equal(e.enabled, false);
assert.equal(e.disabledReason, "failing");
assert.ok(e.disabledAt);
assert.equal(endpointHealth(e, now).state, "removed");
assert.equal((await webhookAlert(merchant))?.state, "removed", "the dashboard shows the removal");
assert.match(removedEmail(e).text, /press Save/);

// Saving with webhooks on (what Settings does after a removal) starts over.
await saveEndpoint(merchant, { url: "https://shop.example.com/hook", enabled: true });
e = await ep();
assert.equal(e.enabled, true);
assert.equal(e.disabledReason, null);
assert.equal(e.failingSince, null);
assert.equal(e.consecutiveFailures, 0);
assert.equal(e.warnedAt, null);
assert.equal(endpointHealth(e, now).state, "ok");
assert.equal(await webhookAlert(merchant), null);

// Changing the URL while warned also starts over; saving the same URL doesn't.
await fail(FAILING_MIN_ATTEMPTS);
await set({ failingSince: ago(25 * H) });
await checkEndpointHealth(now);
await saveEndpoint(merchant, { url: "https://shop.example.com/hook" });
assert.equal(endpointHealth(await ep(), now).state, "warned", "same URL: still warned");
await saveEndpoint(merchant, { url: "https://shop.example.com/new-hook" });
assert.equal(endpointHealth(await ep(), now).state, "ok", "new URL: fresh start");

// Webhooks the merchant turned off themselves are never warned about or removed.
await saveEndpoint(merchant, { url: "https://shop.example.com/new-hook", enabled: false });
await fail(FAILING_MIN_ATTEMPTS);
await set({ failingSince: ago(10 * D), warnedAt: ago(5 * D) });
assert.deepEqual(await checkEndpointHealth(now), { warned: 0, removed: 0 });
assert.equal((await ep()).disabledReason, null);

await client.close();
console.log("webhook health: all checks passed");
