import { blake2b } from "@noble/hashes/blake2.js";

// Nimiq user-friendly addresses: "NQ" + 2 IBAN check digits + base32(20-byte address),
// grouped in blocks of 4. See https://nimiq.dev/protocol/accounts
const ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVXY";

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function ibanCheck(str: string): number {
  const num = str
    .split("")
    .map((c) => {
      const code = c.toUpperCase().charCodeAt(0);
      return code >= 48 && code <= 57 ? c : (code - 55).toString();
    })
    .join("");
  let tmp = "";
  for (let i = 0; i < Math.ceil(num.length / 6); i++) {
    tmp = (parseInt(tmp + num.substr(i * 6, 6), 10) % 97).toString();
  }
  return parseInt(tmp, 10);
}

export function addressFromBytes(addr: Uint8Array): string {
  if (addr.length !== 20) throw new Error("Address must be 20 bytes");
  const base32 = base32Encode(addr);
  const check = ("00" + (98 - ibanCheck(base32 + "NQ00"))).slice(-2);
  return `NQ${check}${base32}`.replace(/.{4}/g, "$& ").trim();
}

export function addressFromPublicKey(publicKey: Uint8Array): string {
  return addressFromBytes(blake2b(publicKey, { dkLen: 32 }).subarray(0, 20));
}

/** Normalise to the canonical "NQxx xxxx ..." form, or null if invalid. */
export function normalizeAddress(input: string): string | null {
  const s = input.replace(/\s+/g, "").toUpperCase();
  if (!/^NQ\d{2}[0-9A-HJ-NP-VXY]{32}$/.test(s)) return null;
  if (ibanCheck(s.slice(4) + s.slice(0, 4)) !== 1) return null;
  return s.replace(/.{4}/g, "$& ").trim();
}

export function shortAddress(addr: string): string {
  const parts = addr.split(" ");
  return parts.length === 9 ? `${parts[0]} ${parts[1]} … ${parts[8]}` : addr;
}
