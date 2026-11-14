import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Invoice, WebhookEndpoint, WebhookEvent } from "./db/schema";
import { env, isProd } from "./env";
import { Errors } from "./errors";
import { logger } from "./logger";
import { ROTATION_OVERLAP_HOURS } from "./webhook-policy";
import { checkSignature } from "./webhook-signature";

// "Pay with NimBill": a merchant's store creates board invoices with signed requests and gets a
// webhook when one is paid. No API key: the one webhook secret signs both ways (see
// webhook-signature.ts). Delivery is done by the webhook worker, which reads webhook_events.

/** How long the old secret keeps working after a rotation. */
const ROTATION_OVERLAP_MS = ROTATION_OVERLAP_HOURS * 3600 * 1000;

const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
function randomId(prefix: string, len: number): string {
  const limit = 256 - (256 % ALPHABET.length);
  let out = "";
  while (out.length < len) {
    for (const b of randomBytes(len)) if (b < limit && out.length < len) out += ALPHABET[b % ALPHABET.length];
  }
  return `${prefix}_${out}`;
}

// ---------- secrets at rest ----------

const DEV_KEY = "nimbill-dev-only-webhook-key-never-use-in-production";

function key(): Buffer {
  const secret = env.WEBHOOK_KEY_SECRET ?? (isProd ? null : DEV_KEY);
  if (!secret) throw Errors.config("WEBHOOK_KEY_SECRET (32+ chars) must be set in production to use webhooks.");
  return createHash("sha256").update(`nimbill-webhook-secret-v1:${secret}`).digest();
}

/** A new webhook secret, shown to the merchant once. */
export const newWebhookSecret = () => `whsec_${randomBytes(32).toString("base64url")}`;

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv, ct, c.getAuthTag()].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptSecret(enc: string): string {
  const [v, iv, ct, tag] = enc.split(".");
  if (v !== "v1" || !iv || !ct || !tag) throw Errors.internal("Unreadable webhook secret.");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

/** Every secret that may sign right now: the current one, then the rotated-out one while it lasts. */
export function activeSecrets(ep: WebhookEndpoint, now = Date.now()): string[] {
  const out = [decryptSecret(ep.secretEnc)];
  if (ep.previousSecretEnc && ep.previousExpiresAt && ep.previousExpiresAt.getTime() > now) out.push(decryptSecret(ep.previousSecretEnc));
  return out;
}

// ---------- URLs ----------

const LOCAL_NAME = /(^|\.)(localhost|local|internal|lan|home|arpa)$/i;

/** Hosts that are obviously not a public website. The worker checks the resolved IP again on every delivery. */
function privateHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (LOCAL_NAME.test(h)) return true;
  const v = isIP(h);
  if (v === 4) {
    const [a, b] = h.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b < 128) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b < 32) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (v === 6) return h === "::" || h === "::1" || /^(fc|fd|fe8|fe9|fea|feb)/.test(h) || h.startsWith("::ffff:");
  return false;
}

/** A URL NimBill may send people or webhooks to: https on a public host (plain http on localhost in development). */
export function checkPublicUrl(raw: string, what: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw Errors.validation(`${what} must be a full URL, like https://shop.example.com/…`);
  }
  if (u.username || u.password) throw Errors.validation(`${what} can't contain a username or password.`);
  const devLocal = !isProd && u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (devLocal) return u;
  if (u.protocol !== "https:") throw Errors.validation(`${what} must start with https://`);
  if (privateHost(u.hostname)) throw Errors.validation(`${what} must be on a public website, not a local or private address.`);
  return u;
}

/** The returnUrl a signed invoice asked for, if it is on the store's allowed origin. */
export function checkReturnUrl(ep: WebhookEndpoint, raw: string): string {
  if (!ep.returnOrigin) throw Errors.validation("Set the store's address in NimBill Settings → Webhooks before sending returnUrl.");
  const u = checkPublicUrl(raw, "returnUrl");
  if (u.origin !== ep.returnOrigin) throw Errors.validation(`returnUrl must be on ${ep.returnOrigin}, the store address saved in NimBill.`);
  return u.toString();
}

// ---------- endpoints (Settings → Webhooks) ----------

export async function getEndpoint(merchantAddress: string): Promise<WebhookEndpoint | null> {
  const db = await getDb();
  const [ep] = await db.select().from(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.merchantAddress, merchantAddress));
  return ep ?? null;
}

export type EndpointInput = { url: string; returnOrigin?: string | null; enabled?: boolean };

/** Create the merchant's endpoint (the answer carries its new secret, once) or change its settings. */
export async function saveEndpoint(merchantAddress: string, input: EndpointInput): Promise<{ endpoint: WebhookEndpoint; secret?: string }> {
  const url = checkPublicUrl(input.url, "The webhook URL").toString();
  const returnOrigin =
    input.returnOrigin === undefined
      ? undefined
      : input.returnOrigin
        ? checkPublicUrl(input.returnOrigin, "The store address").origin
        : null;
  const db = await getDb();
  const existing = await getEndpoint(merchantAddress);
  if (existing) {
    const [endpoint] = await db
      .update(schema.webhookEndpoints)
      .set({
        url,
        ...(returnOrigin !== undefined ? { returnOrigin } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.webhookEndpoints.id, existing.id))
      .returning();
    return { endpoint };
  }
  const secret = newWebhookSecret();
  const [endpoint] = await db
    .insert(schema.webhookEndpoints)
    .values({
      id: randomId("we", 12),
      merchantAddress,
      url,
      returnOrigin: returnOrigin ?? null,
      secretEnc: encryptSecret(secret),
      enabled: input.enabled ?? true,
    })
    .onConflictDoNothing()
    .returning();
  if (!endpoint) throw Errors.conflict("Webhooks were just set up in another tab. Reload the page.");
  return { endpoint, secret };
}

/** A new secret. The old one keeps working for ROTATION_OVERLAP_MS, so the store can switch without downtime. */
export async function rotateSecret(merchantAddress: string): Promise<{ endpoint: WebhookEndpoint; secret: string }> {
  const ep = await getEndpoint(merchantAddress);
  if (!ep) throw Errors.notFound("Set up webhooks first.");
  const secret = newWebhookSecret();
  const db = await getDb();
  const [endpoint] = await db
    .update(schema.webhookEndpoints)
    .set({
      secretEnc: encryptSecret(secret),
      previousSecretEnc: ep.secretEnc,
      previousExpiresAt: new Date(Date.now() + ROTATION_OVERLAP_MS),
      updatedAt: new Date(),
    })
    .where(eq(schema.webhookEndpoints.id, ep.id))
    .returning();
  return { endpoint, secret };
}

/** Turn webhooks off for good. Signed requests with the old secret stop working at once. */
export async function deleteEndpoint(merchantAddress: string): Promise<void> {
  const db = await getDb();
  await db.delete(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.merchantAddress, merchantAddress));
}

export async function recentEvents(merchantAddress: string, limit = 20): Promise<WebhookEvent[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.webhookEvents)
    .where(eq(schema.webhookEvents.merchantAddress, merchantAddress))
    .orderBy(desc(schema.webhookEvents.createdAt))
    .limit(limit);
}

/** What the merchant sees in Settings. Never the secret. */
export function endpointView(ep: WebhookEndpoint, events: WebhookEvent[]) {
  const rotating = ep.previousExpiresAt && ep.previousExpiresAt.getTime() > Date.now() ? ep.previousExpiresAt.toISOString() : null;
  return {
    id: ep.id,
    url: ep.url,
    returnOrigin: ep.returnOrigin,
    enabled: ep.enabled,
    createdAt: ep.createdAt.toISOString(),
    /** Until when the previous secret still works, while a rotation is in progress. */
    previousSecretValidUntil: rotating,
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      invoiceId: e.invoiceId,
      status: e.status,
      attempts: e.attempts,
      lastStatus: e.lastStatus,
      lastError: e.lastError,
      createdAt: e.createdAt.toISOString(),
      deliveredAt: e.deliveredAt?.toISOString() ?? null,
    })),
  };
}
export type WebhookEndpointView = ReturnType<typeof endpointView>;

// ---------- signed store requests ----------

/**
 * A board invoice request carried a NimBill-Signature header: check it against the board owner's
 * secret. A present but wrong signature is an error, never silently treated as anonymous, so a
 * store with a bad secret finds out at once instead of missing every webhook.
 */
export async function verifyStoreRequest(merchantAddress: string, header: string, rawBody: string): Promise<WebhookEndpoint> {
  const ep = await getEndpoint(merchantAddress);
  if (!ep || !ep.enabled) throw Errors.unauthorized("This merchant has no webhooks turned on, so signed requests can't be accepted.");
  const r = checkSignature(header, rawBody, activeSecrets(ep));
  if (r.ok) return ep;
  throw Errors.unauthorized(
    r.reason === "expired"
      ? "The NimBill-Signature timestamp is more than 5 minutes off. Sign each request when you send it, and check the server clock."
      : r.reason === "malformed"
        ? 'The NimBill-Signature header must look like "t=<unix seconds>,v1=<hex HMAC-SHA256>".'
        : "The NimBill-Signature doesn't match. Sign the exact raw body with your webhook secret.",
  );
}

// ---------- outbox ----------

/** "Send test event": queue a webhook.test with a made-up paid invoice, so the store can check its handler. */
export async function queueTestEvent(merchantAddress: string): Promise<void> {
  const ep = await getEndpoint(merchantAddress);
  if (!ep) throw Errors.notFound("Set up webhooks first.");
  if (!ep.enabled) throw Errors.badRequest("Turn webhooks on to send a test event.");
  const db = await getDb();
  await db.insert(schema.webhookEvents).values({
    id: randomId("evt", 16),
    merchantAddress,
    type: "webhook.test",
    invoiceId: randomId("test", 10),
  });
}

/**
 * Queue the "invoice.paid" webhook. Called from markPaid right after the unpaid -> paid update, for
 * signed invoices only. Idempotent (unique type + invoice), and it never throws: payment confirmation
 * must not fail because of a webhook. A row missed here is added again by the worker's sweep.
 */
export async function recordInvoicePaid(inv: Invoice): Promise<void> {
  if (!inv.integrationId || inv.isDemo) return;
  try {
    const db = await getDb();
    await db
      .insert(schema.webhookEvents)
      .values({ id: randomId("evt", 16), merchantAddress: inv.merchantAddress, type: "invoice.paid", invoiceId: inv.id })
      .onConflictDoNothing();
  } catch (e) {
    logger.error("webhook event not recorded", { invoiceId: inv.id, error: (e as Error).message });
  }
}
