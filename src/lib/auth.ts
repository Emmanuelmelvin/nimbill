import "server-only";
import { cookies } from "next/headers";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { env, isProd } from "./env";
import { Errors } from "./errors";
import { addressFromPublicKey } from "./nimiq-address";

const COOKIE = "nimbill_session";
const SESSION_TTL_S = 60 * 60 * 24 * 30; // 30 days
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

// Secret for signing challenges + session tokens. Must be set in production.
const g = globalThis as unknown as { __nimbillDevSecret?: string };
function secret(): Uint8Array {
  if (env.SESSION_SECRET) return utf8ToBytes(env.SESSION_SECRET);
  if (isProd) throw Errors.config("SESSION_SECRET (32+ chars) must be set in production.");
  g.__nimbillDevSecret ??= bytesToHex(randomBytes(32));
  return utf8ToBytes(g.__nimbillDevSecret);
}

function mac(data: string): string {
  return bytesToHex(hmac(sha256, secret(), utf8ToBytes(data)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** A human-readable message the user signs in Nimiq Pay. Stateless: authenticated with an HMAC tag. */
export function createChallenge(host: string): string {
  const nonce = bytesToHex(randomBytes(12));
  const issued = new Date().toISOString();
  const body = `Sign in to NimBill\nSite: ${host}\nNonce: ${nonce}\nIssued: ${issued}`;
  return `${body}\nTag: ${mac(body).slice(0, 32)}`;
}

function checkChallenge(message: string): boolean {
  const m = message.match(/^([\s\S]*)\nTag: ([0-9a-f]{32})$/);
  if (!m) return false;
  const [, body, tag] = m;
  if (!safeEqual(mac(body).slice(0, 32), tag)) return false;
  const issued = body.match(/\nIssued: (.+)$/)?.[1];
  const t = issued ? Date.parse(issued) : NaN;
  return Number.isFinite(t) && Date.now() - t < CHALLENGE_TTL_MS && t - Date.now() < 60_000;
}

/** Nimiq signed-message scheme: ed25519(sha256("\x16Nimiq Signed Message:\n" + len + message)). */
export function verifyNimiqSignature(message: string, publicKeyHex: string, signatureHex: string): boolean {
  try {
    const data = utf8ToBytes(`\x16Nimiq Signed Message:\n${message.length}${message}`);
    return ed25519.verify(hexToBytes(signatureHex), sha256(data), hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
}

export function verifySignIn(message: string, publicKeyHex: string, signatureHex: string): string | null {
  if (!checkChallenge(message)) return null;
  if (!/^[0-9a-f]{64}$/i.test(publicKeyHex) || !/^[0-9a-f]{128}$/i.test(signatureHex)) return null;
  if (!verifyNimiqSignature(message, publicKeyHex, signatureHex)) return null;
  return addressFromPublicKey(hexToBytes(publicKeyHex));
}

export async function setSession(address: string) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
  const payload = `${address.replace(/ /g, "")}.${exp}`;
  const jar = await cookies();
  jar.set(COOKIE, `${payload}.${mac(payload)}`, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_S,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in merchant's Nimiq address, or throws UNAUTHORIZED. */
export async function requireSessionAddress(): Promise<string> {
  const address = await getSessionAddress();
  if (!address) throw Errors.unauthorized();
  return address;
}

/** Returns the signed-in merchant's Nimiq address ("NQxx xxxx ..."), or null. */
export async function getSessionAddress(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [addr, exp, tag] = parts;
  if (!safeEqual(mac(`${addr}.${exp}`), tag)) return null;
  if (Number(exp) * 1000 < Date.now()) return null;
  return addr.replace(/.{4}/g, "$& ").trim();
}
