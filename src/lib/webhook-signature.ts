// The "NimBill-Signature" header, used both ways for "Pay with NimBill":
//   store -> NimBill: the store signs the invoices it creates (POST /api/pay/<tag>/invoices)
//   NimBill -> store: NimBill signs every webhook it delivers
//
//   NimBill-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
//
// The whole secret string ("whsec_…") is the HMAC key. While a rotated-out secret is still valid,
// NimBill puts one v1= per secret in the header; a signature is accepted if any v1 matches.
// No server-only imports: the webhook worker and the docs' example code use the same functions.
import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "nimbill-signature";
/** Signatures older (or newer) than this are refused, so a captured request can't be replayed later. */
export const SIGNATURE_TOLERANCE_S = 300;

export function computeSignature(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** The header value for `body`, signed with every secret given (current first). */
export function signatureHeader(secrets: string[], body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return [`t=${timestamp}`, ...secrets.map((s) => `v1=${computeSignature(s, timestamp, body)}`)].join(",");
}

export type SignatureCheck = { ok: true } | { ok: false; reason: "malformed" | "expired" | "mismatch" };

/** Check a NimBill-Signature header against the raw body and any of the valid secrets. */
export function checkSignature(
  header: string | null | undefined,
  body: string,
  secrets: string[],
  nowS = Math.floor(Date.now() / 1000),
): SignatureCheck {
  if (!header) return { ok: false, reason: "malformed" };
  let t: number | null = null;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === "t" && /^\d{1,12}$/.test(v)) t = Number(v);
    else if (k === "v1" && /^[0-9a-f]{64}$/i.test(v)) sigs.push(v.toLowerCase());
  }
  if (t === null || !sigs.length) return { ok: false, reason: "malformed" };
  if (Math.abs(nowS - t) > SIGNATURE_TOLERANCE_S) return { ok: false, reason: "expired" };
  for (const secret of secrets) {
    const expected = Buffer.from(computeSignature(secret, t, body), "hex");
    for (const s of sigs) {
      if (timingSafeEqual(expected, Buffer.from(s, "hex"))) return { ok: true };
    }
  }
  return { ok: false, reason: "mismatch" };
}
