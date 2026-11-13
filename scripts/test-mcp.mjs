// Unit & end-to-end stdio integration test for the NimBill Agent Wallet MCP server.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  addressToBytes,
  assertSpendAllowed,
  buildAndSignNimiqTx,
  clientNonceForTx,
  completeDualSignature,
  formatChequeCode,
  getSavedChequeSecret,
  linkKeyFromSecret,
  loadOrCreateAgentWallet,
  LUNA_PER_NIM,
  newChequeSecret,
  nimiqRpc,
  parseChequeInput,
  recordSpend,
  saveChequeSecret,
  serializeBasicTxContent,
  signNimiqMessage,
  spentLast24h,
} from "../mcp/wallet.mjs";

const bytesToHexLocal = (b) => Buffer.from(b).toString("hex");

const B = process.argv[2] || process.env.NIMBILL_URL || "http://localhost:3000";

let failed = 0;
const ok = (cond, msg) => {
  console.log((cond ? "PASS " : "FAIL ") + msg);
  if (!cond) failed++;
};

// 1. Wallet creation & persistence
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nimbill-mcp-test-"));
const walletPath = path.join(tmpDir, "agent-wallet.json");
const w1 = loadOrCreateAgentWallet(walletPath);
const w2 = loadOrCreateAgentWallet(walletPath);
ok(/^NQ\d{2}(\s[0-9A-Z]{4}){8}$/.test(w1.address), `agent wallet generates valid Nimiq address (${w1.address})`);
ok(w1.address === w2.address && w1.publicKeyHex === w2.publicKeyHex, "agent wallet persists and reloads identical keypair");
ok(addressToBytes(w1.address).length === 20, "addressToBytes decodes 20-byte Nimiq address");
ok(signNimiqMessage("Challenge 123", w1.secretKey).length === 128, "signNimiqMessage produces 64-byte Ed25519 signature");

// 2. Basic & Extended (memo) Nimiq Albatross transaction signing + live RPC decoding check
const basicTx = buildAndSignNimiqTx({
  secretKey: w1.secretKey,
  recipient: "NQ07 0000 0000 0000 0000 0000 0000 0000 0000",
  valueLuna: 100_000,
  validityStartHeight: 40_000_000,
});
ok(basicTx.rawTx.length === 278 && basicTx.rawTx.startsWith("0000"), "Basic transaction is 139 bytes (variant 0)");

const memoTx = buildAndSignNimiqTx({
  secretKey: w1.secretKey,
  recipient: "NQ07 0000 0000 0000 0000 0000 0000 0000 0000",
  valueLuna: 250_000,
  validityStartHeight: 40_000_000,
  memo: "NimBill 89mwch33sp",
});
ok(memoTx.rawTx.startsWith("01") && memoTx.txHash.length === 64, "Extended (memo) transaction is variant 1 with 32-byte Blake2b hash");

try {
  const decoded = await nimiqRpc("getRawTransactionInfo", [memoTx.rawTx]);
  ok(
    decoded.hash === memoTx.txHash &&
      decoded.from === w1.address &&
      decoded.value === 250_000 &&
      Buffer.from(decoded.recipientData, "hex").toString("utf8") === "NimBill 89mwch33sp",
    "Live Nimiq RPC (getRawTransactionInfo) validates agent's signed Extended transaction & memo",
  );
} catch (e) {
  console.log("SKIP live RPC decode check:", e.message);
}

// 3. Cheque helpers in MCP wallet
const secret = newChequeSecret();
const code = formatChequeCode("c9f8e7d6c5", secret);
const parsed = parseChequeInput(code);
ok(parsed?.id === "c9f8e7d6c5" && parsed?.secret === secret, "MCP cheque parser round-trips CHQ-… code");
const lk = linkKeyFromSecret(secret);
const txContent = serializeBasicTxContent({
  senderPublicKey: lk.publicKey,
  recipient: w1.address,
  value: 100_000,
  validityStartHeight: 40_000_000,
});
ok(clientNonceForTx(secret, txContent).noncePublicKey.length === 64, "MCP clientNonceForTx produces 32-byte nonce commitment");
ok(
  clientNonceForTx(secret, txContent).noncePublicKey !== clientNonceForTx(secret, txContent).noncePublicKey,
  "MCP client nonce is fresh on every signing attempt",
);

// 3b. The MCP's copy of the cheque crypto must match the app's (src/lib/cheque-crypto.ts).
const app = await import("../src/lib/cheque-crypto.ts");
const inputs = [code, `https://x.test/c/c9f8e7d6c5#${secret}`, "/c/c9f8e7d6c5", "CHQ-C9F8E-7D6C5", "chq c9f8e 7d6c5 " + secret, "nope"];
ok(
  inputs.every((s) => JSON.stringify(app.parseChequeInput(s)) === JSON.stringify(parseChequeInput(s))),
  "MCP parseChequeInput matches the app for links, codes and short numbers",
);
ok(linkKeyFromSecret(secret).publicKey === app.linkKeyFromSecret(secret).publicKey, "MCP link key matches the app");
ok(
  bytesToHexLocal(txContent) ===
    bytesToHexLocal(
      app.serializeBasicTxContent({
        senderPublicKey: lk.publicKey,
        recipient: w1.address,
        value: 100_000,
        validityStartHeight: 40_000_000,
      }),
    ),
  "MCP transaction serialization matches the app",
);
ok(
  Array.from({ length: 50 }, () => newChequeSecret()).every((s) => app.isValidChequeSecret(s)),
  "MCP cheque secrets are valid app secrets",
);

// 3c. Full 2-of-2 round trip: app server half + MCP client half, and the old key-leak attack fails.
{
  const srv = app.keyFromSeedBytes("test-server:", crypto.getRandomValues(new Uint8Array(32)));
  const chq = app.combinePublicKeys(lk.publicKey, srv.publicKey);
  const tx = { senderPublicKey: chq.publicKey, recipient: w1.address, value: 100_000, fee: 0, validityStartHeight: 40_000_000 };
  const content = serializeBasicTxContent(tx);
  const n1 = clientNonceForTx(secret, content);
  const part = app.serverPartialSignTx({
    serverScalar: srv.scalar,
    chequePublicKey: chq.publicKey,
    clientNoncePublicKey: n1.noncePublicKey,
    txContent: content,
  });
  const signed = completeDualSignature({ secret, tx, nonceScalar: n1.nonceScalar, ...part });
  ok(app.verifyRawBasicTx(signed.rawTx, tx).valid, "MCP + app produce a valid 2-of-2 cheque signature");

  const again = app.serverPartialSignTx({
    serverScalar: srv.scalar,
    chequePublicKey: chq.publicKey,
    clientNoncePublicKey: clientNonceForTx(secret, content).noncePublicKey,
    txContent: content,
  });
  const repeat = app.serverPartialSignTx({
    serverScalar: srv.scalar,
    chequePublicKey: chq.publicKey,
    clientNoncePublicKey: n1.noncePublicKey,
    txContent: content,
  });
  ok(
    again.serverNoncePublicKey !== part.serverNoncePublicKey && repeat.serverNoncePublicKey !== part.serverNoncePublicKey,
    "server never reuses its nonce, even for the same transaction and client nonce",
  );
  ok(!app.isValidPointHex("00".repeat(32)) && app.isValidPointHex(lk.publicKey), "isValidPointHex rejects bad points");
}

// 3d. Spending limits, saved cheque secrets, and wallet encryption.
{
  process.env.NIMBILL_MAX_PAYMENT_NIM = "10";
  process.env.NIMBILL_MAX_DAILY_NIM = "15";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nimbill-mcp-limits-"));
  let threw = null;
  try {
    assertSpendAllowed(dir, 11 * LUNA_PER_NIM, "Test");
  } catch (e) {
    threw = e.code;
  }
  ok(threw === "SPENDING_LIMIT", "per-payment spending limit blocks a payment above it");
  recordSpend(dir, 9 * LUNA_PER_NIM, { what: "Test" });
  threw = null;
  try {
    assertSpendAllowed(dir, 9 * LUNA_PER_NIM, "Test");
  } catch (e) {
    threw = e.code;
  }
  ok(threw === "SPENDING_LIMIT" && spentLast24h(dir) === 9, "daily spending limit counts earlier payments");
  delete process.env.NIMBILL_MAX_PAYMENT_NIM;
  delete process.env.NIMBILL_MAX_DAILY_NIM;

  saveChequeSecret(dir, "c9f8e7d6c5", secret);
  ok(getSavedChequeSecret(dir, "c9f8e7d6c5") === secret, "cheque secrets are saved and read back");

  process.env.NIMBILL_WALLET_PASSPHRASE = "correct horse battery staple";
  const encFile = path.join(dir, "enc-wallet.json");
  const e1 = loadOrCreateAgentWallet(encFile);
  const onDisk = fs.readFileSync(encFile, "utf8");
  const e2 = loadOrCreateAgentWallet(encFile);
  ok(
    !onDisk.includes(bytesToHexLocal(e1.secretKey)) && onDisk.includes('"encrypted"'),
    "wallet key is encrypted on disk with a passphrase",
  );
  ok(e1.address === e2.address, "encrypted wallet reloads the same key");
  process.env.NIMBILL_WALLET_PASSPHRASE = "wrong";
  let wrong = false;
  try {
    loadOrCreateAgentWallet(encFile);
  } catch {
    wrong = true;
  }
  ok(wrong, "a wrong passphrase can't open the wallet");
  delete process.env.NIMBILL_WALLET_PASSPHRASE;
  fs.rmSync(dir, { recursive: true, force: true });
}

// 4. Spawn MCP stdio server and run full JSON-RPC conversation
const proc = spawn(process.execPath, [path.resolve("mcp/index.mjs")], {
  env: { ...process.env, NIMBILL_WALLET_FILE: walletPath, NIMBILL_URL: B },
  stdio: ["pipe", "pipe", "inherit"],
});

let nextId = 1;
const pending = new Map();
let buf = "";
proc.stdout.on("data", (chunk) => {
  buf += chunk.toString("utf8");
  let nl;
  while ((nl = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    const waiter = pending.get(msg.id);
    if (waiter) {
      pending.delete(msg.id);
      waiter(msg);
    }
  }
});

function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

async function callTool(name, args = {}) {
  const res = await rpc("tools/call", { name, arguments: args });
  const text = res.result?.content?.[0]?.text;
  return { isError: !!res.result?.isError, data: text ? JSON.parse(text) : null };
}

const initRes = await rpc("initialize", { protocolVersion: "2024-11-05" });
proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
ok(
  initRes.result?.serverInfo?.name === "nimbill-agent-wallet" && initRes.result?.instructions?.includes(w1.address),
  "MCP initialize returns serverInfo and agent wallet address in instructions",
);

const toolsRes = await rpc("tools/list");
const toolNames = (toolsRes.result?.tools || []).map((t) => t.name);
ok(
  toolNames.length === 15 &&
    toolNames.includes("wallet_status") &&
    toolNames.includes("pay_invoice") &&
    toolNames.includes("buy_from_board") &&
    toolNames.includes("send_to_tag") &&
    toolNames.includes("write_cheque") &&
    toolNames.includes("cash_cheque"),
  `MCP tools/list exposes ${toolNames.length} tools`,
);

const resList = await rpc("resources/list");
ok(resList.result?.resources?.[0]?.uri === "nimbill://wallet", "MCP resources/list exposes nimbill://wallet resource");

const tools = toolsRes.result?.tools || [];
ok(
  ["pay_invoice", "send_to_tag", "write_cheque", "buy_from_board"].every(
    (n) => tools.find((t) => t.name === n)?.annotations?.destructiveHint,
  ) && tools.find((t) => t.name === "get_board")?.annotations?.readOnlyHint,
  "MCP tools carry read-only / destructive annotations",
);

const oddVersion = await rpc("initialize", { protocolVersion: "1999-01-01" });
ok(oddVersion.result?.protocolVersion === "2025-06-18", "MCP answers an unknown protocol version with its own latest");

const badArgs = await callTool("lookup_tag", {});
ok(badArgs.isError && badArgs.data.code === "INVALID_ARGUMENTS", "MCP rejects a tool call with a missing required argument");
const badType = await callTool("pay_invoice", { invoiceId: 42 });
ok(badType.isError && /must be a string/.test(badType.data.error), "MCP rejects a tool argument of the wrong type");

const parseErr = await new Promise((resolve) => {
  pending.set(null, resolve);
  proc.stdin.write("{not json\n");
});
ok(parseErr.error?.code === -32700, "MCP answers malformed JSON with a parse error");

// 5. End-to-end tool calls against the live NimBill server (if running at B)
const serverUp = await fetch(`${B}/api/auth/challenge`)
  .then((r) => r.ok)
  .catch(() => false);

if (serverUp) {
  console.log(`\nRunning live end-to-end MCP tool calls against ${B}…`);
  const rnd = Math.random()
    .toString(36)
    .slice(2, 7)
    .replace(/[^a-z0-9]/g, "a");
  const agentTag = `agent_${rnd}`;

  const st1 = await callTool("wallet_status");
  ok(!st1.isError && st1.data.address === w1.address, `MCP wallet_status signs in as ${st1.data?.address}`);

  const prof = await callTool("setup_profile", {
    name: "Ada AI Agent",
    tag: agentTag,
    bio: "Autonomous design assistant",
    defaultCurrency: "USD",
  });
  ok(
    !prof.isError && prof.data.merchant?.tag === agentTag && prof.data.handle === `${agentTag}@nimbill`,
    `MCP setup_profile claims tag ${prof.data?.handle}`,
  );

  const looked = await callTool("lookup_tag", { tag: agentTag });
  ok(!looked.isError && looked.data.owner?.address === w1.address, `MCP lookup_tag resolves ${agentTag}@nimbill to ${w1.address}`);

  const board = await callTool("get_board", { tag: agentTag });
  ok(!board.isError && board.data.merchant?.name === "Ada AI Agent", "MCP get_board reads agent's public pay board");

  const createdInv = await callTool("create_invoice", {
    clientName: "Tunde Client",
    currency: "USD",
    items: [{ description: "AI Logo Audit", quantity: 1, unitPrice: 15 }],
    note: "Generated via MCP",
  });
  ok(
    !createdInv.isError && createdInv.data.invoice?.number?.startsWith("INV-"),
    `MCP create_invoice creates ${createdInv.data?.invoice?.number} (${createdInv.data?.url})`,
  );

  const fetchedInv = await callTool("get_invoice", { invoiceId: createdInv.data.invoice.nimbillNumber });
  ok(
    !fetchedInv.isError && fetchedInv.data.invoice?.id === createdInv.data.invoice.id,
    `MCP get_invoice resolves by NMN number (${createdInv.data.invoice.nimbillNumber})`,
  );

  const listedInvs = await callTool("list_invoices");
  ok(!listedInvs.isError && listedInvs.data.invoices?.length === 1, "MCP list_invoices returns agent's invoices");

  const dryPay = await callTool("pay_invoice", { invoiceId: createdInv.data.invoice.id, dryRun: true });
  if (dryPay.isError && /unavailable/i.test(dryPay.data?.error || "")) {
    console.log("SKIP pay_invoice dryRun (live CoinGecko rates unavailable)");
  } else {
    ok(
      !dryPay.isError &&
        dryPay.data.status === "dry_run" &&
        dryPay.data.quote?.memo === `NimBill ${createdInv.data.invoice.id}` &&
        dryPay.data.rawTx?.startsWith("01"),
      `MCP pay_invoice (dryRun) locks quote & signs Extended tx (${dryPay.data?.txHash?.slice(0, 12)}…)`,
    );
  }

  const chq = await callTool("write_cheque", {
    amount: 25,
    currency: "NIM",
    note: "Agent reward cheque",
    fundOnChain: false,
  });
  ok(
    !chq.isError &&
      chq.data.cheque?.recipient?.kind === "free" &&
      chq.data.chequeCode?.startsWith("CHQ-") &&
      chq.data.claimUrl?.includes("#"),
    `MCP write_cheque creates non-custodial cheque ${chq.data?.cheque?.number} (${chq.data?.chequeCode})`,
  );

  const listedChqs = await callTool("list_cheques");
  ok(!listedChqs.isError && listedChqs.data.cheques?.length === 1, "MCP list_cheques returns agent's written cheques");
} else {
  console.log(`\nNote: Dev server not running at ${B}; skipped live HTTP tool calls.`);
}

proc.kill();
fs.rmSync(tmpDir, { recursive: true, force: true });

if (failed > 0) {
  console.error(`\n${failed} MCP test(s) failed`);
  process.exitCode = 1;
}
