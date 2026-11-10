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
ok(r.status === 201 && r.body.invoice.isDemo, `demo invoice ${r.body?.invoice?.number} total ${r.body?.invoice?.total} USD`);
r = await call(`/api/invoices/${r.body.invoice.id}/quote`, { method: "POST", body: JSON.stringify({ asset: "NIM" }) });
ok(r.status === 200, `demo costs ${Number(r.body.quote.amount) / 1e5} NIM`);
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
