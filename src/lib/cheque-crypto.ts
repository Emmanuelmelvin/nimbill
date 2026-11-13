// Non-custodial cheque cryptography and Nimiq Albatross transaction builder.
// Shared by the browser and the server (no server-only imports).
//
// Each cheque has a 2-of-2 Ed25519 key:
//   A_cheque = A_link + A_server
// - A_link comes from the ~118-bit secret in the cheque link's #fragment (or cheque code).
//   The server never sees the secret, so NimBill can never move a cheque's funds on its own.
// - A_server is derived deterministically on the server from HMAC(SESSION_SECRET, chequeId).
//   The server only co-signs after checking the cheque's rules (e.g. locked to a @tag, or
//   cancelled by the writer), so nobody can bypass the rules with a raw RPC call.
//
// Signing is a two-party Schnorr signature. Each side's nonce MUST be fresh for every signing
// attempt: if one side ever answers twice with the same nonce but a different challenge, its key
// share can be computed from the two answers. Both nonces therefore mix in fresh randomness, and
// the server's nonce is also bound to the client's nonce commitment.

import { ed25519 } from "@noble/curves/ed25519.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { addressFromPublicKey, normalizeAddress } from "./nimiq-address";

const Point = ed25519.Point;
const CURVE_N = Point.CURVE().n;

// Same 30-character alphabet as newId() in lib/invoices.ts (no 0, 1, i, l, o).
const ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const ID_RE = /^[2-9a-hjkmnp-z]{10}$/;
const SECRET_LEN = 24; // 24 chars * ~4.9 bits ≈ 118 bits of entropy
const SECRET_RE = /^[2-9a-hjkmnp-z]{24}$/;

// Nimiq base32 alphabet for decoding 20-byte addresses.
const NIMIQ_ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVXY";

/** Nimiq Mainnet Albatross network ID. */
export const NIMIQ_MAINNET_ID = 24;

/** Generate a fresh 24-character cheque secret in the browser. */
export function newChequeSecret(): string {
  // Rejection sampling: bytes at or above the largest multiple of 30 are skipped, so every
  // character is equally likely (a plain `b % 30` would favour the first 16 characters).
  const limit = 256 - (256 % ID_ALPHABET.length);
  let out = "";
  while (out.length < SECRET_LEN) {
    for (const b of crypto.getRandomValues(new Uint8Array(SECRET_LEN))) {
      if (b < limit && out.length < SECRET_LEN) out += ID_ALPHABET[b % ID_ALPHABET.length];
    }
  }
  return out;
}

export function normalizeChequeSecret(raw: string): string {
  return raw
    .trim()
    .replace(/^#/, "")
    .replace(/[\s\-–—]/g, "")
    .toLowerCase();
}

export function isValidChequeSecret(raw: string): boolean {
  return SECRET_RE.test(normalizeChequeSecret(raw));
}

/** Short display number on a cheque, like "CHQ-K7M2P-9QX4Z". */
export function chequeNumber(chequeId: string): string {
  const s = chequeId.toUpperCase();
  return `CHQ-${s.slice(0, 5)}-${s.slice(5, 10)}`;
}

/**
 * Full self-contained cheque code that carries both the cheque ID and its secret,
 * grouped for reading or pasting on the Cash screen:
 *   "CHQ-K7M2P-9QX4Z-A2B3C4-D5E6F7-G8H9J2-K3M4N5"
 */
export function formatChequeCode(chequeId: string, secret: string): string {
  const id = chequeId.toUpperCase();
  const s = normalizeChequeSecret(secret).toUpperCase();
  return `CHQ-${id.slice(0, 5)}-${id.slice(5, 10)}-${s.slice(0, 6)}-${s.slice(6, 12)}-${s.slice(12, 18)}-${s.slice(18, 24)}`;
}

/**
 * Parse whatever a user pasted into "Cash a cheque":
 * - A cheque link: "https://…/c/k7m2p9qx4z#a2b3c4…" or "/c/k7m2p9qx4z"
 * - A full cheque code: "CHQ-K7M2P-9QX4Z-A2B3C4-D5E6F7-G8H9J2-K3M4N5"
 * - A short cheque number: "CHQ-K7M2P-9QX4Z" (opens the cheque page; cashing still needs the secret)
 */
export function parseChequeInput(input: string): { id: string; secret: string | null } | null {
  const text = input.trim();

  const link = text.match(/\/c\/([a-z0-9]{10})(?:#([a-z0-9\-]+))?/i);
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

  if (ID_RE.test(stripped)) {
    return { id: stripped, secret: null };
  }

  return null;
}

// ---------- 2-of-2 Ed25519 helpers ----------

const ZERO = BigInt(0);
const ONE = BigInt(1);
const EIGHT = BigInt(8);
const BYTE_MASK = BigInt(0xff);

function bytesToNumberLE(bytes: Uint8Array): bigint {
  let res = ZERO;
  for (let i = bytes.length - 1; i >= 0; i--) {
    res = (res << EIGHT) | BigInt(bytes[i]);
  }
  return res;
}

function numberToBytesLE(num: bigint, len = 32): Uint8Array {
  const out = new Uint8Array(len);
  let v = ((num % CURVE_N) + CURVE_N) % CURVE_N;
  for (let i = 0; i < len; i++) {
    out[i] = Number(v & BYTE_MASK);
    v >>= EIGHT;
  }
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function hashToScalar(...parts: Uint8Array[]): bigint {
  const s = bytesToNumberLE(sha512(concatBytes(...parts))) % CURVE_N;
  return s === ZERO ? ONE : s;
}

/** True if `hex` is a valid, non-identity, torsion-free Ed25519 point (a safe public key or nonce). */
export function isValidPointHex(hex: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
  try {
    const p = Point.fromHex(hex.toLowerCase());
    return !p.is0() && p.isTorsionFree();
  } catch {
    return false;
  }
}

/** Derive the client's half of the cheque key from the link secret. */
export function linkKeyFromSecret(rawSecret: string): { scalar: bigint; publicKey: string } {
  const secret = normalizeChequeSecret(rawSecret);
  if (!SECRET_RE.test(secret)) throw new Error("Invalid cheque secret");
  const scalar = hashToScalar(utf8ToBytes("nimbill-cheque-link-key-v1:"), utf8ToBytes(secret));
  const point = Point.BASE.multiply(scalar);
  return { scalar, publicKey: bytesToHex(point.toBytes()) };
}

/** Derive a key pair from a scalar seed (used by the server for its rule-checking half). */
export function keyFromSeedBytes(domain: string, seed: Uint8Array): { scalar: bigint; publicKey: string } {
  const scalar = hashToScalar(utf8ToBytes(domain), seed);
  const point = Point.BASE.multiply(scalar);
  return { scalar, publicKey: bytesToHex(point.toBytes()) };
}

/** Combine the link's public key and the server's public key into the cheque's Nimiq address. */
export function combinePublicKeys(linkPubHex: string, serverPubHex: string): { publicKey: string; address: string } {
  const p1 = Point.fromHex(linkPubHex);
  const p2 = Point.fromHex(serverPubHex);
  const combined = p1.add(p2).toBytes();
  return {
    publicKey: bytesToHex(combined),
    address: addressFromPublicKey(combined),
  };
}

// ---------- Nimiq Albatross Basic Transaction ----------

/** Decode a Nimiq "NQxx xxxx …" address into its 20 raw bytes. */
export function addressToBytes(address: string): Uint8Array {
  const norm = normalizeAddress(address);
  if (!norm) throw new Error(`Invalid Nimiq address: ${address}`);
  const base32 = norm.replace(/\s+/g, "").slice(4);
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of base32) {
    const idx = NIMIQ_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid character in Nimiq address: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

export type BasicTxFields = {
  senderPublicKey: string; // 64-char hex (the combined 32-byte cheque public key)
  recipient: string; // "NQxx …"
  value: bigint | number | string; // Luna
  fee?: bigint | number | string; // Luna (defaults to 0)
  validityStartHeight: number;
  networkId?: number; // defaults to 24 (Mainnet Albatross)
};

/**
 * Exact 67-byte `Transaction::serialize_content` payload signed by Nimiq Albatross
 * basic transactions, and hashed with Blake2b-256 to get the transaction hash.
 */
export function serializeBasicTxContent(tx: BasicTxFields): Uint8Array {
  const pubKey = hexToBytes(tx.senderPublicKey);
  if (pubKey.length !== 32) throw new Error("senderPublicKey must be 32 bytes");
  const senderBytes = blake2b(pubKey, { dkLen: 32 }).subarray(0, 20);
  const recipientBytes = addressToBytes(tx.recipient);
  const value = BigInt(tx.value);
  const fee = BigInt(tx.fee ?? 0);
  const networkId = tx.networkId ?? NIMIQ_MAINNET_ID;

  const buf = new ArrayBuffer(67);
  const view = new DataView(buf);
  const out = new Uint8Array(buf);
  let o = 0;
  view.setUint16(o, 0, false); // recipient_data.len = 0
  o += 2;
  out.set(senderBytes, o);
  o += 20;
  out[o++] = 0; // sender_type = Basic (0)
  out.set(recipientBytes, o);
  o += 20;
  out[o++] = 0; // recipient_type = Basic (0)
  view.setBigUint64(o, value, false);
  o += 8;
  view.setBigUint64(o, fee, false);
  o += 8;
  view.setUint32(o, tx.validityStartHeight >>> 0, false);
  o += 4;
  out[o++] = networkId & 0xff;
  out[o++] = 0; // flags = 0
  out[o++] = 0; // sender_data.len = 0
  return out;
}

/** The 64-character hex transaction hash on the Nimiq blockchain. */
export function hashBasicTxContent(tx: BasicTxFields): string {
  return bytesToHex(blake2b(serializeBasicTxContent(tx), { dkLen: 32 }));
}

/**
 * A fresh client nonce r_1 and its commitment R_1 for one signing attempt of `txContent`.
 * Fresh randomness is mixed in on every call, so a retry never reuses a nonce (a server that
 * answered the same nonce with two different challenges could otherwise compute the link key).
 * Keep `nonceScalar` in memory, pass it to `completeDualSignature`, and use it once.
 */
export function clientNonceForTx(rawSecret: string, txContent: Uint8Array): { nonceScalar: bigint; noncePublicKey: string } {
  const secret = normalizeChequeSecret(rawSecret);
  const fresh = crypto.getRandomValues(new Uint8Array(32));
  const nonceScalar = hashToScalar(utf8ToBytes("nimbill-cheque-nonce-1:"), utf8ToBytes(secret), txContent, fresh);
  const point = Point.BASE.multiply(nonceScalar);
  return { nonceScalar, noncePublicKey: bytesToHex(point.toBytes()) };
}

/**
 * Server side: produce the server's nonce public key R_2 and partial signature s_2
 * over `txContent` after verifying all cheque rules.
 */
export function serverPartialSignTx(params: {
  serverScalar: bigint;
  chequePublicKey: string;
  clientNoncePublicKey: string;
  txContent: Uint8Array;
}): { serverNoncePublicKey: string; serverPartialSig: string } {
  const R1 = Point.fromHex(params.clientNoncePublicKey);
  // Bound to the client's commitment R_1 and to fresh randomness: two requests can never get the
  // same r_2 with different challenges, which would reveal the server's key share.
  const serverSeedBytes = numberToBytesLE(params.serverScalar, 32);
  const fresh = crypto.getRandomValues(new Uint8Array(32));
  const r2 = hashToScalar(utf8ToBytes("nimbill-cheque-nonce-2:"), serverSeedBytes, params.txContent, R1.toBytes(), fresh);
  const R2 = Point.BASE.multiply(r2);
  const R = R1.add(R2).toBytes();
  const A = hexToBytes(params.chequePublicKey);
  const k = bytesToNumberLE(sha512(concatBytes(R, A, params.txContent))) % CURVE_N;
  const s2 = (r2 + k * params.serverScalar) % CURVE_N;
  return {
    serverNoncePublicKey: bytesToHex(R2.toBytes()),
    serverPartialSig: bytesToHex(numberToBytesLE(s2, 32)),
  };
}

/**
 * Client side: combine the link secret's partial signature s_1 with the server's s_2,
 * verify the resulting 64-byte Ed25519 signature, and return the 139-byte raw Nimiq transaction.
 * `tx` must be the transaction the caller built itself, never fields echoed back by the server.
 */
export function completeDualSignature(params: {
  secret: string;
  tx: BasicTxFields;
  /** `nonceScalar` from the `clientNonceForTx` call whose commitment was sent to the server. */
  nonceScalar: bigint;
  serverNoncePublicKey: string;
  serverPartialSig: string;
}): { rawTx: string; txHash: string; signature: string } {
  const txContent = serializeBasicTxContent(params.tx);
  const { scalar: a1 } = linkKeyFromSecret(params.secret);
  const r1 = params.nonceScalar;
  const R1 = Point.BASE.multiply(r1);
  const R2 = Point.fromHex(params.serverNoncePublicKey);
  const R = R1.add(R2).toBytes();
  const A = hexToBytes(params.tx.senderPublicKey);
  const k = bytesToNumberLE(sha512(concatBytes(R, A, txContent))) % CURVE_N;
  const s1 = (r1 + k * a1) % CURVE_N;
  const s2 = bytesToNumberLE(hexToBytes(params.serverPartialSig));
  if (s2 >= CURVE_N) throw new Error("Invalid server partial signature");
  const s = (s1 + s2) % CURVE_N;
  const sigBytes = concatBytes(R, numberToBytesLE(s, 32));

  if (!ed25519.verify(sigBytes, txContent, A)) {
    throw new Error("Cheque signature could not be verified. Check the cheque link or code.");
  }

  const signature = bytesToHex(sigBytes);
  const rawTx = serializeSignedBasicTx(params.tx, signature);
  const txHash = bytesToHex(blake2b(txContent, { dkLen: 32 }));
  return { rawTx, txHash, signature };
}

/** Assemble the 139-byte Nimiq Albatross Basic Transaction hex for `sendRawTransaction`. */
export function serializeSignedBasicTx(tx: BasicTxFields, signatureHex: string): string {
  const pubKey = hexToBytes(tx.senderPublicKey);
  const sig = hexToBytes(signatureHex);
  if (pubKey.length !== 32 || sig.length !== 64) throw new Error("Invalid public key or signature length");
  const recipientBytes = addressToBytes(tx.recipient);
  const value = BigInt(tx.value);
  const fee = BigInt(tx.fee ?? 0);
  const networkId = tx.networkId ?? NIMIQ_MAINNET_ID;

  const buf = new ArrayBuffer(139);
  const view = new DataView(buf);
  const out = new Uint8Array(buf);
  let o = 0;
  out[o++] = 0; // TransactionFormat::Basic (enum variant 0)
  out[o++] = 0; // proof_type_and_flags: Ed25519 (0), no webauthn
  out.set(pubKey, o);
  o += 32;
  out.set(recipientBytes, o);
  o += 20;
  view.setBigUint64(o, value, false);
  o += 8;
  view.setBigUint64(o, fee, false);
  o += 8;
  view.setUint32(o, tx.validityStartHeight >>> 0, false);
  o += 4;
  out[o++] = networkId & 0xff;
  out.set(sig, o);
  return bytesToHex(out);
}

/** Verify a 139-byte raw Nimiq Basic transaction matches `tx` and has a valid signature. */
export function verifyRawBasicTx(rawTxHex: string, expected: BasicTxFields): { valid: boolean; txHash: string } {
  if (!/^[0-9a-f]{278}$/i.test(rawTxHex)) return { valid: false, txHash: "" };
  const raw = hexToBytes(rawTxHex);
  const sig = raw.slice(75, 139);
  const expectedPrefix = hexToBytes(serializeSignedBasicTx(expected, bytesToHex(sig))).slice(0, 75);
  for (let i = 0; i < 75; i++) {
    if (raw[i] !== expectedPrefix[i]) return { valid: false, txHash: "" };
  }
  const txContent = serializeBasicTxContent(expected);
  const pubKey = hexToBytes(expected.senderPublicKey);
  if (!ed25519.verify(sig, txContent, pubKey)) return { valid: false, txHash: "" };
  return { valid: true, txHash: bytesToHex(blake2b(txContent, { dkLen: 32 })) };
}
