// Checks the NimBill-Signature format used both ways by "Pay with NimBill" (src/lib/webhook-signature.ts).
// Run: npm run test:webhooks
import assert from "node:assert/strict";
import { checkSignature, computeSignature, signatureHeader } from "../src/lib/webhook-signature.ts";

const secret = "whsec_test_secret_one";
const other = "whsec_test_secret_two";
const body = JSON.stringify({ payerName: "Shop order 42", amount: 25, currency: "USD", description: "Order 42" });
const now = 1_800_000_000;

// The documented recipe: hex HMAC-SHA256(secret, "<t>.<raw body>").
const { createHmac } = await import("node:crypto");
assert.equal(computeSignature(secret, now, body), createHmac("sha256", secret).update(`${now}.${body}`).digest("hex"));

const header = signatureHeader([secret], body, now);
assert.match(header, /^t=1800000000,v1=[0-9a-f]{64}$/);
assert.deepEqual(checkSignature(header, body, [secret], now), { ok: true });

// Within the 5-minute tolerance, either way; outside it refused.
assert.deepEqual(checkSignature(header, body, [secret], now + 300), { ok: true });
assert.deepEqual(checkSignature(header, body, [secret], now - 300), { ok: true });
assert.deepEqual(checkSignature(header, body, [secret], now + 301), { ok: false, reason: "expired" });

// Any change to the body, or the wrong secret, fails.
assert.deepEqual(checkSignature(header, body + " ", [secret], now), { ok: false, reason: "mismatch" });
assert.deepEqual(checkSignature(header, body, [other], now), { ok: false, reason: "mismatch" });

// During a rotation: two v1= values, and either secret on the receiving side is enough.
const both = signatureHeader([other, secret], body, now);
assert.equal(both.split(",").length, 3);
assert.deepEqual(checkSignature(both, body, [secret], now), { ok: true });
assert.deepEqual(checkSignature(header, body, [other, secret], now), { ok: true });

// Garbage headers are refused without throwing.
for (const bad of [null, "", "t=abc,v1=00", "v1=" + "a".repeat(64), `t=${now}`, `t=${now},v1=xyz`]) {
  assert.equal(checkSignature(bad, body, [secret], now).ok, false, String(bad));
}

console.log("webhook signature: all checks passed");
