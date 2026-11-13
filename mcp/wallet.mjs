// Non-custodial Nimiq Ed25519 wallet & Albatross transaction builder for the NimBill MCP agent.
//
// The cheque helpers below mirror src/lib/cheque-crypto.ts (the app's TypeScript can't be
// imported by plain Node here). scripts/test-mcp.mjs checks that both give identical results.
import { ed25519 } from "@noble/curves/ed25519.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const NIMIQ_ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVXY";
const ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const ID_RE = /^[2-9a-hjkmnp-z]{10}$/;
const SECRET_LEN = 24;
const SECRET_RE = /^[2-9a-hjkmnp-z]{24}$/;
const CURVE_N = ed25519.Point.Fn.ORDER;
const Point = ed25519.Point;
export const NIMIQ_MAINNET_ID = 24;
export const LUNA_PER_NIM = 100_000;
const RPC_TIMEOUT_MS = 15_000;

function ibanCheck(str) {
  let rem = 0;
  for (const ch of str) {
    const code = ch >= "0" && ch <= "9" ? ch.charCodeAt(0) - 48 : ch.charCodeAt(0) - 55;
    rem = code >= 10 ? (rem * 100 + code) % 97 : (rem * 10 + code) % 97;
  }
  return 98 - rem;
}

/** Derive a Nimiq "NQxx xxxx …" address from a 32-byte Ed25519 public key. */
export function addressFromPublicKey(publicKeyBytes) {
  const hash = blake2b(publicKeyBytes, { dkLen: 32 }).subarray(0, 20);
  let bits = 0;
  let value = 0;
  let base32 = "";
  for (const byte of hash) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      base32 += NIMIQ_ALPHABET[(value >>> bits) & 31];
    }
  }
  const check = String(ibanCheck(base32 + "NQ00")).padStart(2, "0");
  const full = "NQ" + check + base32;
  return full.match(/.{1,4}/g).join(" ");
}

/** Canonical "NQxx xxxx …" form of an address, or null if it is malformed or its checksum is wrong. */
export function normalizeAddress(address) {
  const clean = String(address).toUpperCase().replace(/\s+/g, "");
  if (!/^NQ\d{2}[0-9A-HJ-NP-VXY]{32}$/.test(clean)) return null;
  if (ibanCheck(clean.slice(4) + clean.slice(0, 4)) !== 98 - 1) return null;
  return clean.match(/.{4}/g).join(" ");
}

/** Decode a Nimiq "NQxx xxxx …" address into its 20 raw bytes. */
export function addressToBytes(address) {
  const norm = normalizeAddress(address);
  if (!norm) throw new Error(`Invalid Nimiq address: ${address}`);
  const base32 = norm.replace(/\s+/g, "").slice(4);
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of base32) {
    value = (value << 5) | NIMIQ_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

// ---------- Local secret files (wallet key, cheque secrets, spending log) ----------

/** Folder for the agent's local files: next to the wallet file. */
export function agentDataDir(customWalletPath) {
  return path.dirname(walletFilePath(customWalletPath));
}

function walletFilePath(customWalletPath) {
  return customWalletPath || process.env.NIMBILL_WALLET_FILE || path.join(os.homedir(), ".nimbill", "agent-wallet.json");
}

const passphrase = () => process.env.NIMBILL_WALLET_PASSPHRASE || "";

function encrypt(plaintext, pass) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(pass, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    kdf: "scrypt-n32768-r8-p1",
    cipher: "aes-256-gcm",
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    data: data.toString("hex"),
  };
}

function decrypt(box, pass) {
  const key = crypto.scryptSync(pass, Buffer.from(box.salt, "hex"), 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(box.iv, "hex"));
  decipher.setAuthTag(Buffer.from(box.tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(box.data, "hex")), decipher.final()]).toString("utf8");
}

/** Write JSON atomically with owner-only permissions (where the OS supports them). */
function writeJsonFile(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Read a JSON file that may hold an encrypted `secret` box. */
function readSecretJson(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!raw.encrypted) return { data: raw, encrypted: false };
  if (!passphrase()) throw new Error(`${file} is encrypted: set NIMBILL_WALLET_PASSPHRASE to unlock it.`);
  try {
    return { data: JSON.parse(decrypt(raw.encrypted, passphrase())), encrypted: true, header: raw };
  } catch {
    throw new Error(`Could not decrypt ${file}: wrong NIMBILL_WALLET_PASSPHRASE?`);
  }
}

/** Write a secret JSON object, encrypted when NIMBILL_WALLET_PASSPHRASE is set. */
function writeSecretJson(file, data, publicHeader = {}) {
  writeJsonFile(file, passphrase() ? { ...publicHeader, encrypted: encrypt(JSON.stringify(data), passphrase()) } : data);
}

let warnedPlaintext = false;
function warnIfPlaintext(file) {
  if (passphrase() || warnedPlaintext) return;
  warnedPlaintext = true;
  const why =
    process.platform === "win32"
      ? "Windows ignores the file's owner-only mode, so other programs running as you can read it."
      : "It is protected only by owner-only file permissions.";
  process.stderr.write(
    `[nimbill-mcp] Warning: the agent wallet key in ${file} is stored unencrypted. ${why} ` +
      "Set NIMBILL_WALLET_PASSPHRASE to encrypt it, and keep only small amounts in this wallet.\n",
  );
}

/**
 * Load the agent's Ed25519 wallet from `NIMBILL_AGENT_SECRET_KEY` (64-char hex)
 * or from `~/.nimbill/agent-wallet.json` (creating one on first run). With
 * NIMBILL_WALLET_PASSPHRASE set, the file is encrypted (an existing plaintext file is upgraded).
 */
export function loadOrCreateAgentWallet(customWalletPath) {
  const envKey = process.env.NIMBILL_AGENT_SECRET_KEY?.trim();
  if (envKey) {
    if (!/^[0-9a-f]{64}$/i.test(envKey)) {
      throw new Error("NIMBILL_AGENT_SECRET_KEY must be a 64-character hex string (32 bytes)");
    }
    return walletFromSecret(hexToBytes(envKey.toLowerCase()), "env:NIMBILL_AGENT_SECRET_KEY");
  }

  const walletFile = walletFilePath(customWalletPath);

  if (fs.existsSync(walletFile)) {
    const { data, encrypted } = readSecretJson(walletFile);
    if (!/^[0-9a-f]{64}$/i.test(data.secretKeyHex || "")) throw new Error(`${walletFile} has no valid secretKeyHex`);
    const wallet = walletFromSecret(hexToBytes(data.secretKeyHex.toLowerCase()), walletFile);
    if (!encrypted && passphrase()) {
      writeSecretJson(walletFile, data, { address: wallet.address, publicKeyHex: wallet.publicKeyHex });
    }
    warnIfPlaintext(walletFile);
    return wallet;
  }

  const wallet = walletFromSecret(ed25519.utils.randomSecretKey(), walletFile);
  writeSecretJson(
    walletFile,
    {
      address: wallet.address,
      publicKeyHex: wallet.publicKeyHex,
      secretKeyHex: bytesToHex(wallet.secretKey),
      createdAt: new Date().toISOString(),
    },
    { address: wallet.address, publicKeyHex: wallet.publicKeyHex },
  );
  warnIfPlaintext(walletFile);
  return wallet;
}

function walletFromSecret(secretKey, source) {
  const publicKey = ed25519.getPublicKey(secretKey);
  return { secretKey, publicKey, publicKeyHex: bytesToHex(publicKey), address: addressFromPublicKey(publicKey), source };
}

/** Remember a cheque's link secret on disk, so a cheque this agent writes can always be cancelled. */
export function saveChequeSecret(dataDir, chequeId, secret, info = {}) {
  const file = path.join(dataDir, "cheques.json");
  const current = fs.existsSync(file) ? readSecretJson(file).data : {};
  current[chequeId] = { secret: normalizeChequeSecret(secret), savedAt: new Date().toISOString(), ...info };
  writeSecretJson(file, current);
}

/** A saved cheque secret for `chequeId`, or null. */
export function getSavedChequeSecret(dataDir, chequeId) {
  const file = path.join(dataDir, "cheques.json");
  if (!fs.existsSync(file)) return null;
  const s = readSecretJson(file).data[chequeId]?.secret;
  return s && SECRET_RE.test(s) ? s : null;
}

// ---------- Spending limits ----------

function limitNim(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a number of NIM (0 or more)`);
  return n;
}

/** Current limits in NIM: per payment and per rolling 24 hours. */
export function spendingLimits() {
  return {
    perPaymentNim: limitNim("NIMBILL_MAX_PAYMENT_NIM", 100),
    dailyNim: limitNim("NIMBILL_MAX_DAILY_NIM", 500),
  };
}

function readSpendLog(dataDir) {
  const file = path.join(dataDir, "spend-log.json");
  if (!fs.existsSync(file)) return [];
  try {
    const list = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** NIM sent from the agent wallet in the last 24 hours. */
export function spentLast24h(dataDir) {
  const since = Date.now() - 86_400_000;
  return readSpendLog(dataDir)
    .filter((e) => Date.parse(e.at) >= since)
    .reduce((sum, e) => sum + Number(e.luna) / LUNA_PER_NIM, 0);
}

/** Throws unless sending `luna` stays within the per-payment and 24-hour limits. */
export function assertSpendAllowed(dataDir, luna, what) {
  const nim = Number(luna) / LUNA_PER_NIM;
  const { perPaymentNim, dailyNim } = spendingLimits();
  if (nim > perPaymentNim) {
    throw Object.assign(
      new Error(`${what} needs ${nim} NIM, above this agent's per-payment limit of ${perPaymentNim} NIM (NIMBILL_MAX_PAYMENT_NIM).`),
      { code: "SPENDING_LIMIT" },
    );
  }
  const spent = spentLast24h(dataDir);
  if (spent + nim > dailyNim) {
    throw Object.assign(
      new Error(
        `${what} needs ${nim} NIM, but ${spent} NIM was already sent in the last 24 hours and the daily limit is ${dailyNim} NIM (NIMBILL_MAX_DAILY_NIM).`,
      ),
      { code: "SPENDING_LIMIT" },
    );
  }
}

/** Record a broadcast payment against the 24-hour limit. */
export function recordSpend(dataDir, luna, info) {
  const since = Date.now() - 7 * 86_400_000;
  const log = readSpendLog(dataDir).filter((e) => Date.parse(e.at) >= since);
  log.push({ at: new Date().toISOString(), luna: String(luna), ...info });
  writeJsonFile(path.join(dataDir, "spend-log.json"), log);
}

// ---------- Signing ----------

/** Sign a Nimiq challenge string (`\x16Nimiq Signed Message:\n<len><msg>`) with the agent's secret key. */
export function signNimiqMessage(message, secretKey) {
  const bytes = utf8ToBytes(message);
  const prefix = utf8ToBytes(`\x16Nimiq Signed Message:\n${bytes.length}`);
  const payload = new Uint8Array(prefix.length + bytes.length);
  payload.set(prefix, 0);
  payload.set(bytes, prefix.length);
  const digest = sha256(payload);
  return bytesToHex(ed25519.sign(digest, secretKey));
}

function encodeVarint(n) {
  const out = [];
  let v = n >>> 0;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return new Uint8Array(out);
}

/**
 * Build and sign a Nimiq Mainnet Albatross transaction from the agent's wallet.
 * - When `memo` is empty, produces a 139-byte `TransactionFormat::Basic` transaction.
 * - When `memo` is provided (e.g. `"NimBill <invoiceId>"`), produces a `TransactionFormat::Extended`
 *   transaction carrying `recipient_data`.
 */
export function buildAndSignNimiqTx({
  secretKey,
  recipient,
  valueLuna,
  feeLuna = 0,
  validityStartHeight,
  memo = "",
  networkId = NIMIQ_MAINNET_ID,
}) {
  const publicKey = ed25519.getPublicKey(secretKey);
  const senderBytes = blake2b(publicKey, { dkLen: 32 }).subarray(0, 20);
  const recipientBytes = addressToBytes(recipient);
  const dataBytes = memo ? utf8ToBytes(memo) : new Uint8Array(0);
  if (dataBytes.length > 64) throw new Error("Transaction memo is longer than 64 bytes");
  const value = BigInt(valueLuna);
  const fee = BigInt(feeLuna);
  if (value <= 0n) throw new Error("Transaction value must be positive");

  // 1. `Transaction::serialize_content` (67 + dataBytes.length bytes)
  const content = new Uint8Array(67 + dataBytes.length);
  const cv = new DataView(content.buffer);
  let o = 0;
  cv.setUint16(o, dataBytes.length, false);
  o += 2;
  content.set(dataBytes, o);
  o += dataBytes.length;
  content.set(senderBytes, o);
  o += 20;
  content[o++] = 0; // sender_type = Basic
  content.set(recipientBytes, o);
  o += 20;
  content[o++] = 0; // recipient_type = Basic
  cv.setBigUint64(o, value, false);
  o += 8;
  cv.setBigUint64(o, fee, false);
  o += 8;
  cv.setUint32(o, validityStartHeight >>> 0, false);
  o += 4;
  content[o++] = networkId & 0xff;
  content[o++] = 0; // flags = 0
  content[o++] = 0; // sender_data.len = 0

  const signature = ed25519.sign(content, secretKey);
  const txHash = bytesToHex(blake2b(content, { dkLen: 32 }));

  if (dataBytes.length === 0) {
    // TransactionFormat::Basic (139 bytes)
    const raw = new Uint8Array(139);
    const dv = new DataView(raw.buffer);
    let p = 0;
    raw[p++] = 0; // variant 0 = Basic
    raw[p++] = 0; // Ed25519, no webauthn
    raw.set(publicKey, p);
    p += 32;
    raw.set(recipientBytes, p);
    p += 20;
    dv.setBigUint64(p, value, false);
    p += 8;
    dv.setBigUint64(p, fee, false);
    p += 8;
    dv.setUint32(p, validityStartHeight >>> 0, false);
    p += 4;
    raw[p++] = networkId & 0xff;
    raw.set(signature, p);
    return { rawTx: bytesToHex(raw), txHash };
  }

  // TransactionFormat::Extended (carries recipient_data memo)
  const sigProof = new Uint8Array(98);
  sigProof[0] = 0; // Ed25519, no webauthn
  sigProof.set(publicKey, 1);
  sigProof[33] = 0; // merkle_path len = 0
  sigProof.set(signature, 34);

  const dataLenVarint = encodeVarint(dataBytes.length);
  const proofLenVarint = encodeVarint(sigProof.length);
  const totalLen =
    1 + 20 + 1 + 1 + 20 + 1 + dataLenVarint.length + dataBytes.length + 8 + 8 + 4 + 1 + 1 + proofLenVarint.length + sigProof.length;

  const raw = new Uint8Array(totalLen);
  const dv = new DataView(raw.buffer);
  let p = 0;
  raw[p++] = 1; // variant 1 = Extended
  raw.set(senderBytes, p);
  p += 20;
  raw[p++] = 0; // sender_type = Basic
  raw[p++] = 0; // sender_data len = 0
  raw.set(recipientBytes, p);
  p += 20;
  raw[p++] = 0; // recipient_type = Basic
  raw.set(dataLenVarint, p);
  p += dataLenVarint.length;
  raw.set(dataBytes, p);
  p += dataBytes.length;
  dv.setBigUint64(p, value, false);
  p += 8;
  dv.setBigUint64(p, fee, false);
  p += 8;
  dv.setUint32(p, validityStartHeight >>> 0, false);
  p += 4;
  raw[p++] = networkId & 0xff;
  raw[p++] = 0; // flags = 0
  raw.set(proofLenVarint, p);
  p += proofLenVarint.length;
  raw.set(sigProof, p);

  return { rawTx: bytesToHex(raw), txHash };
}

// ---------- Nimiq JSON-RPC helpers ----------

export async function nimiqRpc(method, params = []) {
  const rpcUrl = process.env.NIMIQ_RPC_URL || "https://rpc.nimiqwatch.com";
  let res;
  try {
    res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(`Nimiq RPC ${method} is unreachable (${e.name === "TimeoutError" ? "timed out" : e.message})`);
  }
  if (!res.ok) throw new Error(`Nimiq RPC ${method} failed: HTTP ${res.status}`);
  const json = await res.json().catch(() => null);
  if (!json) throw new Error(`Nimiq RPC ${method} returned invalid JSON`);
  if (json.error) {
    throw new Error(`Nimiq RPC ${method} failed: ${json.error.message || JSON.stringify(json.error)}`);
  }
  return json.result?.data ?? json.result;
}

/** On-chain balance of `address`. Throws if the RPC can't be reached, instead of reporting 0. */
export async function getAgentBalance(address) {
  const acc = await nimiqRpc("getAccountByAddress", [address]);
  const luna = Number(acc?.balance ?? 0);
  if (!Number.isFinite(luna)) throw new Error("Nimiq RPC returned an invalid balance");
  return { luna, nim: luna / LUNA_PER_NIM };
}

export async function getCurrentBlockHeight() {
  const block = Number(await nimiqRpc("getBlockNumber", []));
  if (!Number.isInteger(block) || block <= 0) throw new Error("Nimiq RPC returned an invalid block height");
  return block;
}

export async function broadcastRawTx(rawTxHex) {
  return await nimiqRpc("sendRawTransaction", [rawTxHex]);
}

// ---------- Non-custodial 2-of-2 Cheque helpers (mirror of src/lib/cheque-crypto.ts) ----------

function bytesToNumberLE(bytes) {
  let res = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    res = (res << 8n) | BigInt(bytes[i]);
  }
  return res;
}

function numberToBytesLE(num, len = 32) {
  const out = new Uint8Array(len);
  let v = ((num % CURVE_N) + CURVE_N) % CURVE_N;
  for (let i = 0; i < len; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function concatBytes(...parts) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function hashToScalar(...parts) {
  const s = bytesToNumberLE(sha512(concatBytes(...parts))) % CURVE_N;
  return s === 0n ? 1n : s;
}

/** A fresh 24-character cheque secret, every character equally likely. */
export function newChequeSecret() {
  const limit = 256 - (256 % ID_ALPHABET.length);
  let out = "";
  while (out.length < SECRET_LEN) {
    for (const b of crypto.randomBytes(SECRET_LEN)) {
      if (b < limit && out.length < SECRET_LEN) out += ID_ALPHABET[b % ID_ALPHABET.length];
    }
  }
  return out;
}

export function normalizeChequeSecret(raw) {
  return String(raw)
    .trim()
    .replace(/^#/, "")
    .replace(/[\s\-–—]/g, "")
    .toLowerCase();
}

export function formatChequeCode(chequeId, secret) {
  const id = chequeId.toUpperCase();
  const s = normalizeChequeSecret(secret).toUpperCase();
  return `CHQ-${id.slice(0, 5)}-${id.slice(5, 10)}-${s.slice(0, 6)}-${s.slice(6, 12)}-${s.slice(12, 18)}-${s.slice(18, 24)}`;
}

/** Same rules as parseChequeInput in src/lib/cheque-crypto.ts. */
export function parseChequeInput(input) {
  const text = String(input).trim();

  const link = text.match(/\/c\/([a-z0-9]{10})(?:#([a-z0-9-]+))?/i);
  if (link && ID_RE.test(link[1].toLowerCase())) {
    const id = link[1].toLowerCase();
    const sec = link[2] ? normalizeChequeSecret(link[2]) : null;
    return { id, secret: sec && SECRET_RE.test(sec) ? sec : null };
  }

  const stripped = text
    .replace(/^CHQ[\s\-–—:#]*/i, "")
    .replace(/[\s\-–—]/g, "")
    .toLowerCase();

  if (stripped.length === 10 + SECRET_LEN) {
    const id = stripped.slice(0, 10);
    const secret = stripped.slice(10);
    if (ID_RE.test(id) && SECRET_RE.test(secret)) return { id, secret };
  }

  if (ID_RE.test(stripped)) return { id: stripped, secret: null };

  return null;
}

export function linkKeyFromSecret(rawSecret) {
  const secret = normalizeChequeSecret(rawSecret);
  if (!SECRET_RE.test(secret)) throw new Error("Invalid cheque secret");
  const scalar = hashToScalar(utf8ToBytes("nimbill-cheque-link-key-v1:"), utf8ToBytes(secret));
  const point = Point.BASE.multiply(scalar);
  return { scalar, publicKey: bytesToHex(point.toBytes()) };
}

export function serializeBasicTxContent(tx) {
  const pubKey = hexToBytes(tx.senderPublicKey);
  if (pubKey.length !== 32) throw new Error("senderPublicKey must be 32 bytes");
  const senderBytes = blake2b(pubKey, { dkLen: 32 }).subarray(0, 20);
  const recipientBytes = addressToBytes(tx.recipient);
  const buf = new ArrayBuffer(67);
  const view = new DataView(buf);
  const out = new Uint8Array(buf);
  let o = 0;
  view.setUint16(o, 0, false);
  o += 2;
  out.set(senderBytes, o);
  o += 20;
  out[o++] = 0;
  out.set(recipientBytes, o);
  o += 20;
  out[o++] = 0;
  view.setBigUint64(o, BigInt(tx.value), false);
  o += 8;
  view.setBigUint64(o, BigInt(tx.fee ?? 0), false);
  o += 8;
  view.setUint32(o, tx.validityStartHeight >>> 0, false);
  o += 4;
  out[o++] = (tx.networkId ?? NIMIQ_MAINNET_ID) & 0xff;
  out[o++] = 0;
  out[o++] = 0;
  return out;
}

/** A fresh nonce for one signing attempt (never reused, even for the same transaction). */
export function clientNonceForTx(rawSecret, txContent) {
  const secret = normalizeChequeSecret(rawSecret);
  const fresh = crypto.randomBytes(32);
  const nonceScalar = hashToScalar(utf8ToBytes("nimbill-cheque-nonce-1:"), utf8ToBytes(secret), txContent, fresh);
  const point = Point.BASE.multiply(nonceScalar);
  return { nonceScalar, noncePublicKey: bytesToHex(point.toBytes()) };
}

/** Combine both halves of the signature over the agent's own `tx` and return the raw transaction. */
export function completeDualSignature({ secret, tx, nonceScalar, serverNoncePublicKey, serverPartialSig }) {
  const txContent = serializeBasicTxContent(tx);
  const { scalar: a1 } = linkKeyFromSecret(secret);
  const r1 = nonceScalar;
  const R1 = Point.BASE.multiply(r1);
  const R2 = Point.fromHex(serverNoncePublicKey);
  const R = R1.add(R2).toBytes();
  const A = hexToBytes(tx.senderPublicKey);
  const k = bytesToNumberLE(sha512(concatBytes(R, A, txContent))) % CURVE_N;
  const s1 = (r1 + k * a1) % CURVE_N;
  const s2 = bytesToNumberLE(hexToBytes(serverPartialSig));
  if (s2 >= CURVE_N) throw new Error("Invalid server partial signature");
  const s = (s1 + s2) % CURVE_N;
  const sigBytes = concatBytes(R, numberToBytesLE(s, 32));
  if (!ed25519.verify(sigBytes, txContent, A)) {
    throw new Error("Cheque 2-of-2 signature verification failed");
  }
  const recipientBytes = addressToBytes(tx.recipient);
  const buf = new ArrayBuffer(139);
  const view = new DataView(buf);
  const out = new Uint8Array(buf);
  let o = 0;
  out[o++] = 0;
  out[o++] = 0;
  out.set(A, o);
  o += 32;
  out.set(recipientBytes, o);
  o += 20;
  view.setBigUint64(o, BigInt(tx.value), false);
  o += 8;
  view.setBigUint64(o, BigInt(tx.fee ?? 0), false);
  o += 8;
  view.setUint32(o, tx.validityStartHeight >>> 0, false);
  o += 4;
  out[o++] = (tx.networkId ?? NIMIQ_MAINNET_ID) & 0xff;
  out.set(sigBytes, o);
  return {
    rawTx: bytesToHex(out),
    txHash: bytesToHex(blake2b(txContent, { dkLen: 32 })),
  };
}
