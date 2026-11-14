import "server-only";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { isProd } from "./env";

// POST to a URL a merchant typed, without letting it reach anything private.
//
// Webhook URLs come from users, so a careless check would let anyone make NimBill's worker call
// internal addresses (cloud metadata at 169.254.169.254, localhost, the private network). Here:
//   - https only (plain http to localhost in development, for testing with a local receiver)
//   - the host is resolved once, every address it resolves to must be public, and the connection
//     goes to that checked address (no second lookup an attacker could answer differently)
//   - redirects are not followed, there is a hard timeout, and only the start of the answer is read

export type PostResult = { status: number | null; body: string; error: string | null; ms: number };

const TIMEOUT_MS = 10_000;
const MAX_BODY = 4 * 1024;

/** True for addresses that are not on the public internet. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b < 128) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, cloud metadata
      (a === 172 && b >= 16 && b < 32) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast, reserved, broadcast
    );
  }
  if (v === 6) {
    const h = ip.toLowerCase();
    if (h.startsWith("::ffff:")) return isPrivateAddress(h.slice(7)); // IPv4-mapped
    return h === "::" || h === "::1" || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith("ff") || h.startsWith("64:ff9b:");
  }
  return true; // not an IP at all: refuse
}

const devLocal = (u: URL) => !isProd && u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);

export async function safePost(rawUrl: string, body: string, headers: Record<string, string>): Promise<PostResult> {
  const started = Date.now();
  const done = (status: number | null, text: string, error: string | null): PostResult => ({
    status,
    body: text,
    error,
    ms: Date.now() - started,
  });

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return done(null, "", "Invalid URL");
  }
  const local = devLocal(url);
  if (url.protocol !== "https:" && !local) return done(null, "", "Only https URLs are allowed");
  if (url.username || url.password) return done(null, "", "URLs with credentials are not allowed");

  // Resolve once and check every address.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let address: string;
  let family: number;
  try {
    const all = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
    if (!all.length) return done(null, "", "The host has no address");
    if (!local && all.some((a) => isPrivateAddress(a.address))) return done(null, "", "The host points to a private address");
    ({ address, family } = all[0]);
  } catch {
    return done(null, "", "The host name could not be resolved");
  }
  // Hand the checked address to the connection instead of letting it look the name up again.
  const pinned: LookupFunction = (_name, opts, cb) => {
    if (opts && typeof opts === "object" && opts.all)
      (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address, family }]);
    else cb(null, address, family);
  };

  return new Promise<PostResult>((resolve) => {
    const req = (url.protocol === "https:" ? https : http).request(
      url,
      {
        method: "POST",
        headers: { ...headers, "content-length": Buffer.byteLength(body).toString() },
        lookup: pinned,
        timeout: TIMEOUT_MS,
        // https: certificate checks stay on, and SNI uses the host name, not the pinned IP.
        servername: isIP(host) ? undefined : host,
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          if (text.length < MAX_BODY) text += chunk.slice(0, MAX_BODY - text.length);
        });
        res.on("end", () => resolve(done(res.statusCode ?? null, text, null)));
        res.on("error", (e) => resolve(done(res.statusCode ?? null, text, e.message)));
      },
    );
    const timer = setTimeout(() => req.destroy(new Error(`No answer within ${TIMEOUT_MS / 1000} s`)), TIMEOUT_MS);
    req.on("timeout", () => req.destroy(new Error(`No answer within ${TIMEOUT_MS / 1000} s`)));
    req.on("error", (e) => resolve(done(null, "", e.message)));
    req.on("close", () => clearTimeout(timer));
    req.end(body);
  });
}
