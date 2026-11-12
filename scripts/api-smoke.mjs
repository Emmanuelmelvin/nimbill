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

// ---- tags ----
async function signInNew() {
  const key = ed25519.utils.randomSecretKey();
  cookie = "";
  const { body } = await call("/api/auth/challenge");
  const res = await call("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ message: body.message, publicKey: bytesToHex(ed25519.getPublicKey(key)), signature: sign(body.message, key) }),
  });
  return res.body.merchant.address;
}
const rnd = Math.random().toString(36).slice(2, 8);
const tagA = `ada_${rnd}`;
const myAddress = (await call("/api/auth/me")).body.merchant.address;

r = await call("/api/tags/check?tag=admin");
ok(r.status === 200 && r.body.available === false && /reserved/.test(r.body.message), "reserved tag refused: " + r.body?.message);
r = await call("/api/tags/check?tag=1ada");
ok(r.body.available === false, "tag must start with a letter: " + r.body?.message);
r = await call("/api/tags/check?tag=ab");
ok(r.body.available === false, "tag too short: " + r.body?.message);
r = await call(`/api/tags/check?tag=${tagA}`);
ok(r.body.available === true, `${tagA} is free`);
r = await call("/api/me", { method: "POST", body: JSON.stringify({ tag: `@${tagA.toUpperCase()}@NimBill` }) });
ok(
  r.status === 200 && r.body.merchant.tag === tagA && r.body.merchant.name === "Ada Studio",
  `claims tag (normalized to ${r.body?.merchant?.tag}), keeps name`,
);
r = await call("/api/me", { method: "POST", body: JSON.stringify({ tag: "has space" }) });
ok(r.status === 400, "rejects a malformed tag: " + r.body?.error?.message);
r = await call(`/api/tags/check?tag=${tagA}`);
ok(r.body.available === true, "your own tag counts as free for you");

cookie = "";
r = await call(`/api/tags/${tagA}@nimbill`);
ok(
  r.status === 200 && r.body.owner.address === myAddress && r.body.owner.name === "Ada Studio" && r.body.owner.handle === `${tagA}@nimbill`,
  "public lookup by tag returns name and address",
);
r = await call(`/api/tags/nobody_${rnd}`);
ok(r.status === 404, "unknown tag -> not found");
r = await call("/api/me", { method: "POST", body: JSON.stringify({ tag: `x_${rnd}` }) });
ok(r.status === 401, "anonymous cannot claim a tag");

const other = await signInNew();
await call("/api/me", { method: "POST", body: JSON.stringify({ name: "Kito Media" }) });
r = await call(`/api/tags/check?tag=${tagA}`);
ok(r.body.available === false, "someone else's tag shows as taken");
r = await call("/api/me", { method: "POST", body: JSON.stringify({ tag: tagA }) });
ok(r.status === 409, "cannot claim someone else's tag: " + r.body?.error?.message);

cookie = mine;
const tagB = `ada_new_${rnd}`;
r = await call("/api/me", { method: "POST", body: JSON.stringify({ tag: tagB }) });
ok(r.status === 200 && r.body.merchant.tag === tagB, "first change after claiming is free");
r = await call("/api/me", { method: "POST", body: JSON.stringify({ tag: `ada_third_${rnd}` }) });
ok(r.status === 400 && /again on/.test(r.body.error.message), "second change waits: " + r.body?.error?.message);

cookie = "";
r = await call(`/api/tags/${tagA}`);
ok(r.status === 404, "old tag no longer resolves");
await signInNew().then(() => call("/api/me", { method: "POST", body: JSON.stringify({ name: "Squatter" }) }));
r = await call("/api/me", { method: "POST", body: JSON.stringify({ tag: tagA }) });
ok(r.status === 409, "a given-up tag stays held for its owner: " + r.body?.error?.message);
ok(other !== myAddress, "second wallet is a different account");

// ---- transfers (amounts in NIM, so no live rate is needed) ----
const kitoAddress = await signInNew();
const kitoTag = `kito_${rnd}`;
await call("/api/me", { method: "POST", body: JSON.stringify({ name: "Kito Media", tag: kitoTag }) });
const kito = cookie;

cookie = mine;
r = await call("/api/transfers", {
  method: "POST",
  body: JSON.stringify({ to: `${kitoTag}@nimbill`, amount: 1.5, currency: "NIM", note: "Lunch" }),
});
ok(
  r.status === 201 &&
    r.body.payment.amount === "150000" &&
    r.body.payment.recipient === kitoAddress &&
    r.body.payment.memo === `NimBill T ${r.body.transfer.id}` &&
    r.body.transfer.direction === "sent" &&
    r.body.transfer.counterparty.handle === `${kitoTag}@nimbill`,
  `transfer started: ${r.body?.payment?.amount} Luna to ${r.body?.transfer?.counterparty?.handle}, memo "${r.body?.payment?.memo}"`,
);
const transferId = r.body.transfer.id;
r = await call("/api/transfers", { method: "POST", body: JSON.stringify({ to: kitoTag, amount: 1000, currency: "NGN" }) });
if (r.status === 503) {
  console.log("SKIP fiat transfer (live rates unavailable)");
} else {
  const fiat = (Number(r.body.payment.amount) / 1e5) * Number(r.body.payment.rate);
  ok(
    r.status === 201 && fiat >= 1000 && fiat < 1000 * 1.01,
    `₦1,000 becomes ${Number(r.body.payment.amount) / 1e5} NIM (worth ₦${fiat.toFixed(2)})`,
  );
}
r = await call("/api/transfers", { method: "POST", body: JSON.stringify({ to: tagB, amount: 1, currency: "NIM" }) });
ok(r.status === 400, "cannot send to your own tag: " + r.body?.error?.message);
r = await call("/api/transfers", { method: "POST", body: JSON.stringify({ to: `nobody_${rnd}`, amount: 1, currency: "NIM" }) });
ok(r.status === 404, "unknown tag -> not found: " + r.body?.error?.message);
r = await call("/api/transfers", { method: "POST", body: JSON.stringify({ to: kitoTag, amount: 0, currency: "NIM" }) });
ok(r.status === 400, "amount must be above 0: " + r.body?.error?.message);
r = await call("/api/transfers", { method: "POST", body: JSON.stringify({ to: kitoTag, amount: 1, currency: "DOGE" }) });
ok(r.status === 400, "unknown currency rejected: " + r.body?.error?.message);
r = await call(`/api/transfers/${transferId}/verify`, { method: "POST", body: JSON.stringify({ txHash: "nothex" }) });
ok(r.body.status === "rejected", "transfer: malformed hash -> rejected");
r = await call(`/api/transfers/${transferId}/verify`, { method: "POST", body: JSON.stringify({ txHash: "ab".repeat(32) }) });
ok(r.body.status === "pending", "transfer: unknown hash -> pending");
r = await call(`/api/transfers/${transferId}/verify`, {
  method: "POST",
  body: JSON.stringify({ txHash: "6ea82e8a926cd8e3babb8f696e0cacf0c8df18ff5f0a25cee50e5d374284739a" }),
});
ok(r.body.status === "rejected", "transfer: real but unrelated tx -> rejected: " + r.body?.message);
r = await call("/api/transfers");
ok(
  r.status === 200 && r.body.transfers.some((t) => t.id === transferId && t.status === "pending" && t.note === "Lunch"),
  "sender sees the pending transfer",
);

cookie = kito;
r = await call(`/api/transfers/${transferId}/verify`, { method: "POST", body: JSON.stringify({ txHash: "ab".repeat(32) }) });
ok(r.status === 404, "only the sender can report the hash");
r = await call("/api/transfers");
ok(r.status === 200 && !r.body.transfers.some((t) => t.id === transferId), "recipient doesn't see it until it's confirmed");
cookie = "";
r = await call("/api/transfers");
ok(r.status === 401, "anonymous cannot list transfers");
r = await call("/api/transfers", { method: "POST", body: JSON.stringify({ to: kitoTag, amount: 1, currency: "NIM" }) });
ok(r.status === 401, "anonymous cannot send");

// ---- board settings ----
r = await call("/api/board");
ok(r.status === 401, "anonymous cannot read board stats");
cookie = mine;
r = await call("/api/auth/me");
ok(r.body.merchant.boardOpenAmounts === true && r.body.merchant.bio === null, "board: open amounts on and no bio by default");
r = await call("/api/me", { method: "POST", body: JSON.stringify({ bio: "  Brand designer, Lagos ", boardOpenAmounts: false }) });
ok(
  r.status === 200 &&
    r.body.merchant.bio === "Brand designer, Lagos" &&
    r.body.merchant.boardOpenAmounts === false &&
    r.body.merchant.name === "Ada Studio",
  "board: bio (trimmed) and open amounts saved, name kept",
);
r = await call("/api/me", { method: "POST", body: JSON.stringify({ bio: "x".repeat(161) }) });
ok(r.status === 400, "board: bio too long: " + r.body?.error?.message);
r = await call("/api/me", { method: "POST", body: JSON.stringify({ bio: "" }) });
ok(r.status === 200 && r.body.merchant.bio === null, "board: empty bio clears it");
r = await call("/api/board");
ok(r.status === 200 && r.body.last30.orders === 0 && r.body.last30.usd === 0, "board: no orders yet in the last 30 days");

// ---- products ----
const PNG_1PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
const fetchRaw = (path) => fetch(B + path, { headers: { cookie } });
cookie = "";
r = await call("/api/products");
ok(r.status === 401, "anonymous cannot list products");
cookie = mine;
r = await call("/api/products", { method: "POST", body: JSON.stringify({ name: "Logo pack", price: 0, currency: "NGN" }) });
ok(r.status === 400, "product price must be above 0: " + r.body?.error?.message);
r = await call("/api/products", { method: "POST", body: JSON.stringify({ name: "", price: 10, currency: "NGN" }) });
ok(r.status === 400, "product needs a name: " + r.body?.error?.message);
r = await call("/api/products", { method: "POST", body: JSON.stringify({ name: "Logo pack", price: 10, currency: "DOGE" }) });
ok(r.status === 400, "product currency must be a fiat currency: " + r.body?.error?.message);
r = await call("/api/products", {
  method: "POST",
  body: JSON.stringify({ name: " Logo pack ", price: 120000, currency: "NGN", description: "3 concepts" }),
});
ok(
  r.status === 201 &&
    r.body.product.name === "Logo pack" &&
    r.body.product.price === "120000.00" &&
    r.body.product.active &&
    r.body.product.imageUrl === null,
  "product created: " + r.body?.product?.name,
);
const productId = r.body.product.id;
r = await call(`/api/products/${productId}/image`, { method: "PUT", body: JSON.stringify({ dataUrl: "data:text/html;base64,PGgxPg==" }) });
ok(r.status === 400, "rejects a non-image upload: " + r.body?.error?.message);
r = await call(`/api/products/${productId}/image`, { method: "PUT", body: JSON.stringify({ dataUrl: PNG_1PX }) });
ok(
  r.status === 200 && r.body.product.imageUrl === `/api/products/${productId}/image?v=1`,
  "picture uploaded: " + r.body?.product?.imageUrl,
);
cookie = "";
res = await fetchRaw(`/api/products/${productId}/image?v=1`);
ok(
  res.status === 200 && res.headers.get("content-type") === "image/png" && /immutable/.test(res.headers.get("cache-control")),
  "anyone can load a live product's picture",
);
cookie = mine;
r = await call(`/api/products/${productId}`, { method: "PATCH", body: JSON.stringify({ active: false, price: 125000 }) });
ok(
  r.status === 200 && r.body.product.active === false && r.body.product.price === "125000.00" && r.body.product.name === "Logo pack",
  "product hidden and repriced, name kept",
);
res = await fetchRaw(`/api/products/${productId}/image?v=1`);
ok(res.status === 200, "owner still sees a hidden product's picture");
cookie = "";
res = await fetchRaw(`/api/products/${productId}/image?v=1`);
ok(res.status === 404, "a hidden product's picture is private");
cookie = kito;
r = await call(`/api/products/${productId}`, { method: "PATCH", body: JSON.stringify({ name: "Mine now" }) });
ok(r.status === 404, "someone else can't edit the product");
r = await call(`/api/products/${productId}`, { method: "DELETE" });
ok(r.status === 404, "someone else can't delete the product");
cookie = mine;
r = await call(`/api/products/${productId}`, { method: "PATCH", body: JSON.stringify({ active: true }) });
r = await call("/api/board");
ok(r.body.liveProducts === 1, "board counts live products: " + r.body?.liveProducts);
r = await call(`/api/products/${productId}/image`, { method: "DELETE" });
ok(r.status === 200 && r.body.product.imageUrl === null, "picture removed");
r = await call(`/api/products/${productId}`, { method: "DELETE" });
ok(r.status === 200, "product deleted");
r = await call(`/api/products/${productId}`);
ok(r.status === 404, "deleted product is gone");

// ---- public board ----
r = await call("/api/products", { method: "POST", body: JSON.stringify({ name: "Brand guide", price: 15000, currency: "NGN" }) });
const boardProduct = r.body.product.id;
const openBefore = (await call("/api/earnings")).body.open.length;
cookie = "";
r = await call(`/api/pay/nobody_${rnd}`);
ok(r.status === 404, "unknown board -> not found");
r = await call(`/api/pay/${tagB}@nimbill`);
ok(
  r.status === 200 &&
    r.body.merchant.name === "Ada Studio" &&
    r.body.merchant.handle === `${tagB}@nimbill` &&
    r.body.products.length === 1 &&
    r.body.merchant.openAmounts === false,
  `anyone can open the board: ${r.body?.merchant?.handle}, ${r.body?.products?.length} product`,
);
const openAmount = { amount: 50000, currency: "NGN", description: "Logo deposit", payerName: "Tunde Bello" };
r = await call(`/api/pay/${tagB}/invoices`, { method: "POST", body: JSON.stringify(openAmount) });
ok(r.status === 400, "open amounts refused while switched off: " + r.body?.error?.message);
r = await call(`/api/pay/${tagB}/invoices`, { method: "POST", body: JSON.stringify({ productId: boardProduct }) });
ok(r.status === 400, "visitor must give a name: " + r.body?.error?.message);
r = await call(`/api/pay/${tagB}/invoices`, {
  method: "POST",
  body: JSON.stringify({ productId: boardProduct, payerName: "Tunde Bello" }),
});
ok(
  r.status === 201 &&
    /^NMN-/.test(r.body.invoice.number) &&
    r.body.invoice.total === "15000.00" &&
    r.body.invoice.items[0].description === "Brand guide" &&
    r.body.invoice.clientName === "Tunde Bello",
  `visitor buys a product: ${r.body?.invoice?.number}, ${r.body?.invoice?.total} ${r.body?.invoice?.currency}`,
);
const boardInvoice = r.body.invoice.id;
r = await call(`/api/pay/${tagB}/invoices`, {
  method: "POST",
  body: JSON.stringify({ productId: boardProduct, quantity: 3, payerName: "Tunde Bello" }),
});
ok(
  r.status === 201 && r.body.invoice.total === "45000.00" && r.body.invoice.items[0].quantity === 3,
  "visitor buys 3 of a product: " + r.body?.invoice?.total,
);
r = await call(`/api/pay/${tagB}/invoices`, {
  method: "POST",
  body: JSON.stringify({ productId: boardProduct, quantity: 0, payerName: "Tunde Bello" }),
});
ok(r.status === 400, "quantity must be at least 1");
r = await call(`/api/invoices/${boardInvoice}`);
ok(r.status === 200 && r.body.invoice.status === "unpaid", "the board invoice opens like any other invoice");

cookie = mine;
await call("/api/me", { method: "POST", body: JSON.stringify({ boardOpenAmounts: true }) });
r = await call(`/api/pay/${tagB}/invoices`, { method: "POST", body: JSON.stringify(openAmount) });
ok(r.status === 400, "you can't pay on your own board: " + r.body?.error?.message);
await call(`/api/products/${boardProduct}`, { method: "PATCH", body: JSON.stringify({ active: false }) });

cookie = "";
r = await call(`/api/pay/${tagB}/invoices`, { method: "POST", body: JSON.stringify(openAmount) });
ok(
  r.status === 201 && r.body.invoice.total === "50000.00" && r.body.invoice.items[0].description === "Logo deposit",
  "visitor pays an open amount",
);
r = await call(`/api/pay/${tagB}/invoices`, { method: "POST", body: JSON.stringify({ productId: boardProduct, payerName: "Tunde" }) });
ok(r.status === 404, "a hidden product can't be bought: " + r.body?.error?.message);
r = await call(`/api/pay/${tagB}`);
ok(r.body.products.length === 0 && r.body.merchant.openAmounts === true, "hidden products leave the board");
r = await call("/api/board/orders");
ok(r.status === 401, "anonymous cannot list board orders");

cookie = mine;
r = await call("/api/board/orders");
ok(
  r.status === 200 && r.body.orders.length === 3 && r.body.orders.every((o) => o.status === "unpaid"),
  "owner sees the three unpaid orders",
);
r = await call("/api/invoices");
ok(!r.body.invoices.some((i) => i.id === boardInvoice), "unpaid board orders stay out of the invoice list");
r = await call("/api/earnings");
ok(r.body.open.length === openBefore, "unpaid board orders don't count as owed");
r = await call("/api/invoices", {
  method: "POST",
  body: JSON.stringify({ clientName: "Acme Ltd", currency: "NGN", items: [{ description: "Retainer", quantity: 1, unitPrice: 1000 }] }),
});
ok(
  r.status === 201 && r.body.invoice.number === "INV-0003",
  "board orders didn't use up invoice numbers: next is " + r.body?.invoice?.number,
);
r = await call("/api/products");
ok(r.body.products.find((p) => p.id === boardProduct)?.sold === 0, "nothing sold until it's paid");

// ---- agents: follow only the board's own howToPay steps, no URLs written here ----
cookie = "";
r = await call(`/api/pay/${tagB}`);
const steps = r.body.howToPay?.steps ?? [];
ok(
  steps.length === 5 && r.body.howToPay.assets.includes("NIM") && /\/docs$/.test(r.body.howToPay.docs),
  "board explains how to pay: " + steps.map((s) => s.title).join(" → "),
);
const absolute = (url) => url.replace(/^https?:\/\/[^/]+/, "");
r = await call(absolute(steps[1].url), {
  method: steps[1].method,
  body: JSON.stringify({ amount: 25, currency: "USD", description: "Agent test: 1 hour of design", payerName: "Agent for Tunde" }),
});
ok(r.status === 201 && steps[1].url.startsWith(B), `agent created an invoice at ${steps[1].url}`);
const agentInvoice = r.body.invoice;
r = await call(absolute(steps[2].url.replace("{invoiceId}", agentInvoice.id)), {
  method: steps[2].method,
  body: JSON.stringify(steps[2].body),
});
if (r.status === 503) {
  console.log("SKIP agent quote (live rates unavailable)");
} else {
  ok(
    r.status === 200 &&
      r.body.quote.memo === `NimBill ${agentInvoice.id}` &&
      r.body.quote.recipient === myAddress &&
      Number(r.body.quote.amount) > 0,
    `agent got a quote: ${Number(r.body.quote.amount) / 1e5} NIM to ${r.body.quote.recipient}`,
  );
}
r = await call(absolute(steps[4].url.replace("{invoiceId}", agentInvoice.id)), {
  method: steps[4].method,
  body: JSON.stringify({ asset: "NIM", txHash: "ab".repeat(32) }),
});
ok(r.body.status === "pending", "agent polls verify: pending until the transaction lands");
res = await fetch(B + "/llms.txt");
const llms = await res.text();
ok(
  res.status === 200 &&
    res.headers.get("content-type").startsWith("text/plain") &&
    llms.includes("/api/pay/{tag}/invoices") &&
    llms.startsWith("# NimBill"),
  "llms.txt is served",
);
res = await fetch(B + "/docs");
const docsHtml = await res.text();
ok(
  res.status === 200 &&
    docsHtml.includes("Get paid by people, programs and AI agents") &&
    docsHtml.includes("ChatGPT") &&
    docsHtml.includes("Grok"),
  "API docs page is served",
);
res = await fetch(B + "/docs/agents", { redirect: "manual" });
ok([307, 308].includes(res.status) && res.headers.get("location").includes("/docs"), "old agent guide redirects to /docs");
res = await fetch(B + "/skill.md");
const skill = await res.text();
ok(
  res.status === 200 && skill.startsWith("---\nname: nimbill-pay\n") && skill.includes("/api/pay/{tag}/invoices"),
  "skill.md is a valid skill file",
);
res = await fetch(B + "/openapi.json");
const spec = await res.json();
ok(
  res.status === 200 &&
    spec.openapi === "3.1.0" &&
    spec.paths["/api/pay/{tag}/invoices"].post.operationId === "createBoardInvoice" &&
    spec.servers[0].url === B,
  `openapi.json lists ${Object.keys(spec.paths).length} paths`,
);
res = await fetch(B + `/pay/${tagB}`);
ok(new RegExp(`type="application/json" href="[^"]*/api/pay/${tagB}"`).test(await res.text()), "pay page points agents to its JSON");
