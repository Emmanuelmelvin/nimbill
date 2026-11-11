// End-to-end API smoke test acting as a Nimiq wallet (no real funds moved).
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
const B = process.argv[2] || "http://localhost:3000";
let cookie = "";
async function call(path, opts = {}) {
  const res = await fetch(B + path, { ...opts, headers: { "content-type": "application/json", cookie, ...(opts.headers || {}) } });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}
const ok = (c, m) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) process.exitCode = 1;
};

const sk = ed25519.utils.randomSecretKey();
const pk = ed25519.getPublicKey(sk);
const {
  body: { message },
} = await call("/api/auth/challenge");
const sign = (msg, key = sk) => bytesToHex(ed25519.sign(sha256(utf8ToBytes(`\x16Nimiq Signed Message:\n${msg.length}${msg}`)), key));

let r = await call("/api/auth/verify", {
  method: "POST",
  body: JSON.stringify({ message, publicKey: bytesToHex(pk), signature: sign(message + "x") }),
});
ok(r.status === 401, "rejects signature over a different message");
r = await call("/api/auth/verify", {
  method: "POST",
  body: JSON.stringify({
    message: message.replace("Nonce", "Nonse"),
    publicKey: bytesToHex(pk),
    signature: sign(message.replace("Nonce", "Nonse")),
  }),
});
ok(r.status === 401, "rejects a tampered challenge");
r = await call("/api/auth/verify", {
  method: "POST",
  body: JSON.stringify({ message, publicKey: bytesToHex(pk), signature: sign(message) }),
});
ok(
  r.status === 200 && /^NQ\d\d( [0-9A-Z]{4}){8}$/.test(r.body.merchant.address),
  "valid signature signs in as " + r.body?.merchant?.address,
);

r = await call("/api/invoices", {
  method: "POST",
  body: JSON.stringify({ clientName: "Acme", currency: "NGN", items: [{ description: "Logo", quantity: 1, unitPrice: 50000 }] }),
});
ok(
  r.status === 400 && /Settings/.test(r.body.error.message),
  "requires a merchant name first: " + `${r.body?.error?.code}: ${r.body?.error?.message}`,
);
r = await call("/api/me", { method: "POST", body: JSON.stringify({ name: "Ada Studio", evmAddress: "0xnotanaddress" }) });
ok(r.status === 400, "rejects bad Polygon address: " + `${r.body?.error?.code}: ${r.body?.error?.message}`);
r = await call("/api/me", {
  method: "POST",
  body: JSON.stringify({ name: "Ada Studio", evmAddress: "0x52908400098527886e0f7030069857d2e4169ee7" }),
});
ok(
  r.status === 200 && r.body.merchant.evmAddress === "0x52908400098527886E0F7030069857D2E4169EE7",
  "saves profile with checksummed EVM address",
);

r = await call("/api/invoices", { method: "POST", body: JSON.stringify({ clientName: "", currency: "NGN", items: [] }) });
ok(r.status === 400, "validation message: " + `${r.body?.error?.code}: ${r.body?.error?.message}`);
r = await call("/api/invoices", {
  method: "POST",
  body: JSON.stringify({
    clientName: "Acme Ltd",
    clientEmail: "a@acme.com",
    currency: "NGN",
    items: [
      { description: "Logo design", quantity: 1, unitPrice: 50000 },
      { description: "Revisions", quantity: 2, unitPrice: 7500.5 },
    ],
    note: "Thanks!",
    dueDate: "2026-12-01",
  }),
});
ok(
  r.status === 201 && r.body.invoice.total === "65001.00" && r.body.invoice.number === "INV-0001",
  `creates invoice ${r.body?.invoice?.number} total ${r.body?.invoice?.total}`,
);
const inv = r.body.invoice;

const anon = cookie;
cookie = "";
r = await call(`/api/invoices/${inv.id}`);
ok(
  r.status === 200 && r.body.isOwner === false && r.body.invoice.clientEmail === undefined,
  "public view hides client email, isOwner=false",
);
r = await call(`/api/invoices/${inv.id}/quote`, { method: "POST", body: JSON.stringify({ asset: "NIM" }) });
const q = r.body.quote;
ok(
  r.status === 200 && Number(q.amount) > 0 && q.memo === `NimBill ${inv.id}`,
  `NIM quote: ${Number(q.amount) / 1e5} NIM @ ${q.rate} NGN, memo "${q.memo}" (${Buffer.byteLength(q.memo)} bytes)`,
);
const fiatCheck = (Number(q.amount) / 1e5) * Number(q.rate);
ok(fiatCheck >= 65001 && fiatCheck < 65001 * 1.001, `quote covers total (${fiatCheck.toFixed(2)} NGN)`);
r = await call(`/api/invoices/${inv.id}/quote`, { method: "POST", body: JSON.stringify({ asset: "USDT" }) });
ok(r.status === 200 && r.body.quote.recipient.startsWith("0x"), `USDT quote: ${Number(r.body.quote.amount) / 1e6} USDT`);
r = await call(`/api/invoices/${inv.id}/verify`, { method: "POST", body: JSON.stringify({ asset: "NIM", txHash: "ab".repeat(32) }) });
ok(r.body.status === "pending", "unknown NIM tx -> pending: " + r.body.message);
r = await call(`/api/invoices/${inv.id}/verify`, {
  method: "POST",
  body: JSON.stringify({ asset: "NIM", txHash: "6ea82e8a926cd8e3babb8f696e0cacf0c8df18ff5f0a25cee50e5d374284739a" }),
});
ok(r.body.status === "rejected", "real but unrelated NIM tx -> rejected: " + r.body.message);
r = await call(`/api/invoices/${inv.id}/verify`, { method: "POST", body: JSON.stringify({ asset: "NIM", txHash: "nothex" }) });
ok(r.body.status === "rejected", "malformed hash -> rejected");
r = await call(`/api/invoices/${inv.id}`, { method: "DELETE" });
ok(r.status === 401, "anonymous cannot cancel");

cookie = anon;
r = await call("/api/invoices");
ok(
  r.status === 200 && r.body.invoices.length === 1 && r.body.invoices[0].clientEmail === "a@acme.com",
  "dashboard lists own invoice with email (reconcile ran)",
);
r = await call("/api/demo", { method: "POST" });
if (r.status === 503) {
  console.log("SKIP demo invoice (DEMO_MERCHANT_ADDRESS is not set on this server)");
} else {
  ok(r.status === 201 && r.body.invoice.isDemo, `demo invoice ${r.body?.invoice?.number} total ${r.body?.invoice?.total} USD`);
  r = await call(`/api/invoices/${r.body.invoice.id}/quote`, { method: "POST", body: JSON.stringify({ asset: "NIM" }) });
  ok(r.status === 200, `demo costs ${Number(r.body.quote.amount) / 1e5} NIM`);
}
r = await call(`/api/invoices/${inv.id}`, { method: "DELETE" });
ok(r.status === 200 && r.body.invoice.status === "cancelled", "owner can cancel");
r = await call(`/api/invoices/${inv.id}/quote`, { method: "POST", body: JSON.stringify({ asset: "NIM" }) });
ok(r.status === 400, "cancelled invoice cannot be quoted: " + `${r.body?.error?.code}: ${r.body?.error?.message}`);
r = await call("/api/validators");
ok(r.status === 200 && r.body.validators.length > 0, "validators: " + r.body.validators.map((v) => v.name).join(", "));
r = await call("/api/staker");
ok(r.status === 200 && r.body.staker === null, "new address is not a staker");
r = await call("/api/stats");
ok(r.status === 200, `stats: created=${r.body.invoicesCreated}`);
r = await call("/api/rates?currency=KES");
ok(r.status === 200 && r.body.rates.NIM > 0, `rates KES: ${JSON.stringify(r.body.rates)}`);

// ---- earnings, display currency, goals, export ----
const today = new Date().toISOString().slice(0, 10);
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
r = await call("/api/earnings");
ok(
  r.status === 200 && Array.isArray(r.body.points) && r.body.open.length === 0 && r.body.currency === "NGN" && r.body.goals.length === 0,
  `earnings: ${r.body?.points?.length} payments, currency follows latest invoice (${r.body?.currency}), fx ${r.body?.fx ? "live" : "unavailable"}`,
);
r = await call("/api/me", { method: "POST", body: JSON.stringify({ displayCurrency: "XXX" }) });
ok(r.status === 400, "rejects unknown display currency: " + r.body?.error?.message);
r = await call("/api/me", { method: "POST", body: JSON.stringify({ displayCurrency: "KES" }) });
ok(
  r.status === 200 && r.body.merchant.displayCurrency === "KES" && r.body.merchant.name === "Ada Studio",
  "saves display currency, keeps the name",
);
r = await call("/api/earnings");
ok(r.body.currency === "KES", "earnings use the saved display currency");

const goal = { title: "November income", targetAmount: 500000, currency: "NGN", startDate: today, endDate: inDays(30), today };
r = await call("/api/goals", { method: "POST", body: JSON.stringify({ ...goal, endDate: inDays(-3), startDate: inDays(-1) }) });
ok(r.status === 400, "goal: end before start rejected: " + r.body?.error?.message);
r = await call("/api/goals", { method: "POST", body: JSON.stringify({ ...goal, startDate: inDays(-40), endDate: inDays(-10) }) });
ok(r.status === 400, "goal: already ended rejected: " + r.body?.error?.message);
r = await call("/api/goals", { method: "POST", body: JSON.stringify({ ...goal, currency: "DOGE" }) });
ok(r.status === 400, "goal: unknown currency rejected: " + r.body?.error?.message);
r = await call("/api/goals", { method: "POST", body: JSON.stringify(goal) });
ok(r.status === 201 && r.body.goal.targetAmount === "500000", "goal created: " + r.body?.goal?.title);
const goalId = r.body.goal.id;
r = await call("/api/goals", { method: "POST", body: JSON.stringify({ ...goal, title: "Second" }) });
ok(r.status === 409, "one goal at a time: " + r.body?.error?.message);
r = await call(`/api/goals/${goalId}`, { method: "POST", body: JSON.stringify({ ...goal, targetAmount: 2500, currency: "USDT" }) });
ok(r.status === 200 && r.body.goal.currency === "USDT" && r.body.goal.targetAmount === "2500", "goal edited");
r = await call("/api/earnings");
ok(r.body.goals.length === 1 && r.body.goals[0].id === goalId, "earnings include the goal");

r = await call("/api/invoices");
ok(
  r.status === 200 && "fx" in r.body && r.body.currency === "KES" && "usd" in r.body.invoices[0],
  `invoice list carries rates and a dollar value (${r.body?.invoices?.[0]?.usd})`,
);
let res = await fetch(B + "/api/invoices/export?range=90d", { headers: { cookie } });
const csv = await res.text();
ok(
  res.status === 200 && res.headers.get("content-type").startsWith("text/csv") && csv.replace(/^﻿/, "").startsWith("Invoice,Client,"),
  "CSV export: " + res.headers.get("content-disposition"),
);
res = await fetch(B + "/api/invoices/export?range=week", { headers: { cookie } });
ok(res.status === 400, "CSV export rejects an unknown range");

const mine = cookie;
cookie = "";
r = await call("/api/earnings");
ok(r.status === 401, "anonymous cannot read earnings");
r = await call(`/api/goals/${goalId}`, { method: "DELETE" });
ok(r.status === 401, "anonymous cannot delete a goal");
res = await fetch(B + "/api/invoices/export");
ok(res.status === 401, "anonymous cannot export");
cookie = mine;
r = await call(`/api/goals/${goalId}`, { method: "DELETE" });
ok(r.status === 200, "owner deletes the goal");
r = await call(`/api/goals/${goalId}`, { method: "DELETE" });
ok(r.status === 404, "deleting it again -> not found");

// ---- saved clients ----
r = await call("/api/clients");
ok(
  r.status === 200 && r.body.clients.length === 1 && r.body.clients[0].name === "Acme Ltd" && r.body.clients[0].saved === false,
  "clients: past invoice clients are offered even when not saved",
);
r = await call("/api/clients", { method: "POST", body: JSON.stringify({ name: "  Kito Media ", email: "pay@kito.example" }) });
ok(r.status === 201 && r.body.client.name === "Kito Media" && r.body.client.saved, "client saved (name trimmed)");
const clientId = r.body.client.id;
r = await call("/api/clients", { method: "POST", body: JSON.stringify({ name: "kito media", email: "" }) });
ok(r.status === 201 && r.body.client.id === clientId && r.body.client.email === null, "saving the same name again updates it");
r = await call("/api/clients", { method: "POST", body: JSON.stringify({ name: "", email: "x" }) });
ok(r.status === 400, "client needs a name: " + r.body?.error?.message);
r = await call("/api/invoices", {
  method: "POST",
  body: JSON.stringify({
    clientName: "Nova Labs",
    clientEmail: "ops@nova.example",
    currency: "USD",
    items: [{ description: "Audit", quantity: 1, unitPrice: 10 }],
    saveClient: true,
  }),
});
ok(r.status === 201, "invoice created with saveClient");
r = await call("/api/clients");
const names = r.body.clients.map((c) => `${c.name}:${c.saved ? "saved" : "past"}`).join(", ");
ok(
  r.body.clients.length === 3 && r.body.clients.find((c) => c.name === "Nova Labs")?.email === "ops@nova.example",
  "clients list: " + names,
);
cookie = "";
r = await call("/api/clients");
ok(r.status === 401, "anonymous cannot list clients");
cookie = mine;
r = await call(`/api/clients/${clientId}`, { method: "DELETE" });
ok(r.status === 200, "saved client removed");
r = await call(`/api/clients/${clientId}`, { method: "DELETE" });
ok(r.status === 404, "removing it again -> not found");
