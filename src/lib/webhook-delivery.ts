import "server-only";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Invoice, WebhookEvent } from "./db/schema";
import { logger } from "./logger";
import { safePost } from "./safe-post";
import { siteUrl } from "./site";
import { activeSecrets, getEndpoint } from "./webhooks";
import { signatureHeader } from "./webhook-signature";

// Sends what's queued in webhook_events. Run by the webhook worker (worker/index.ts), never by the
// web app: delivery makes outgoing calls to URLs merchants typed, so it lives on a host with no
// inbound traffic.
//
// Delivery is at least once. Every event keeps its id across retries, so stores drop duplicates by
// `id`. Events are claimed with a short lease (FOR UPDATE SKIP LOCKED inside one UPDATE), so several
// workers never send the same event at once, and a worker that dies mid-send only delays it.

/** Wait before retry n (after the first attempt fails, retry 1 waits 1 minute…). About 3 days in all. */
export const RETRY_DELAYS_MS = [1, 5, 15, 60, 180, 360, 720, 1440, 1440].map((m) => m * 60_000);
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
/** Events nobody could deliver for this long (e.g. webhooks turned off) are given up on. */
export const MAX_EVENT_AGE_MS = 3 * 24 * 3600 * 1000;
/** How long a claimed event is reserved for the worker that took it. Longer than one delivery can take. */
const LEASE_MS = 60_000;
/** Webhooks turned off: look again this much later. */
const DISABLED_RECHECK_MS = 60 * 60_000;

export const USER_AGENT = "NimBill-Webhooks/1.0";

// ---------- payload ----------

/** The invoice as a store sees it in a webhook: everything public, plus the store's own reference and metadata. */
export function storeInvoice(inv: Invoice) {
  return {
    id: inv.id,
    number: inv.number,
    status: inv.status,
    reference: inv.reference,
    metadata: inv.metadata ?? {},
    payerName: inv.clientName,
    productId: inv.productId,
    items: inv.items,
    currency: inv.currency,
    total: inv.total,
    url: new URL(`/i/${inv.id}`, siteUrl()).toString(),
    createdAt: inv.createdAt.toISOString(),
    payment:
      inv.status === "paid" && inv.paidAsset
        ? {
            asset: inv.paidAsset,
            /** Smallest units: Luna for NIM (1 NIM = 100000), 6 decimals for USDT. Tip included. */
            amount: inv.paidAmount,
            rate: inv.paidRate,
            txHash: inv.paidTxHash,
            from: inv.paidFrom,
            paidAt: inv.paidAt?.toISOString() ?? null,
            tip: inv.paidTip,
            usd: inv.paidUsd,
          }
        : null,
  };
}
export type StoreInvoice = ReturnType<typeof storeInvoice>;

/** A made-up paid invoice for "Send test event", so a store can check its handler without paying. */
function sampleInvoice(merchantAddress: string, eventId: string): StoreInvoice {
  const now = new Date();
  return {
    id: "test_invoice",
    number: "INV-TEST",
    status: "paid",
    reference: "test-order",
    metadata: { test: "true" },
    payerName: "Test payer",
    productId: null,
    items: [{ description: "Test item", quantity: 1, unitPrice: 1 }],
    currency: "USD",
    total: "1.00",
    url: new URL("/settings", siteUrl()).toString(),
    createdAt: now.toISOString(),
    payment: {
      asset: "NIM",
      amount: "100000000",
      rate: "0.001",
      txHash: `test_${eventId}`,
      from: merchantAddress,
      paidAt: now.toISOString(),
      tip: null,
      usd: "1.00",
    },
  };
}

export async function buildPayload(
  ev: WebhookEvent,
): Promise<{ id: string; type: string; createdAt: string; test: boolean; data: { invoice: StoreInvoice } } | null> {
  const base = { id: ev.id, type: ev.type, createdAt: ev.createdAt.toISOString() };
  if (ev.type === "webhook.test") return { ...base, test: true, data: { invoice: sampleInvoice(ev.merchantAddress, ev.id) } };
  const db = await getDb();
  const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, ev.invoiceId));
  if (!inv) return null;
  return { ...base, test: false, data: { invoice: storeInvoice(inv) } };
}

// ---------- claiming and sending ----------

/** Reserve up to `limit` due events for this worker. */
export async function claimDue(limit = 20): Promise<WebhookEvent[]> {
  const db = await getDb();
  const due = db
    .select({ id: schema.webhookEvents.id })
    .from(schema.webhookEvents)
    .where(and(eq(schema.webhookEvents.status, "pending"), lte(schema.webhookEvents.nextAttemptAt, sql`now()`)))
    .orderBy(asc(schema.webhookEvents.nextAttemptAt))
    .limit(limit)
    .for("update", { skipLocked: true });
  return db
    .update(schema.webhookEvents)
    .set({ nextAttemptAt: new Date(Date.now() + LEASE_MS) })
    .where(inArray(schema.webhookEvents.id, due))
    .returning();
}

async function finish(ev: WebhookEvent, changes: Partial<WebhookEvent>) {
  const db = await getDb();
  await db.update(schema.webhookEvents).set(changes).where(eq(schema.webhookEvents.id, ev.id));
}

const giveUp = (ev: WebhookEvent, lastError: string) => finish(ev, { status: "failed", lastError: lastError.slice(0, 300) });

export type DeliveryOutcome = "delivered" | "retry" | "failed" | "waiting";

/** One attempt at one event. Never throws. */
export async function deliver(ev: WebhookEvent): Promise<DeliveryOutcome> {
  try {
    const tooOld = Date.now() - ev.createdAt.getTime() > MAX_EVENT_AGE_MS;
    const ep = await getEndpoint(ev.merchantAddress);
    if (!ep) return (await giveUp(ev, "No webhook URL is set up anymore."), "failed");
    if (!ep.enabled) {
      if (tooOld) return (await giveUp(ev, "Webhooks were turned off for too long."), "failed");
      await finish(ev, { nextAttemptAt: new Date(Date.now() + DISABLED_RECHECK_MS), lastError: "Webhooks are turned off." });
      return "waiting";
    }
    const payload = await buildPayload(ev);
    if (!payload) return (await giveUp(ev, "The invoice no longer exists."), "failed");

    const body = JSON.stringify(payload);
    const attempt = ev.attempts + 1;
    const res = await safePost(ep.url, body, {
      "content-type": "application/json",
      "user-agent": USER_AGENT,
      "nimbill-signature": signatureHeader(activeSecrets(ep), body),
      "nimbill-event-id": ev.id,
      "nimbill-event-type": ev.type,
      "nimbill-delivery-attempt": String(attempt),
    });
    const ok = res.status !== null && res.status >= 200 && res.status < 300;
    const log = { eventId: ev.id, type: ev.type, attempt, status: res.status, ms: res.ms };
    if (ok) {
      await finish(ev, { status: "delivered", attempts: attempt, lastStatus: res.status, lastError: null, deliveredAt: new Date() });
      logger.info("webhook delivered", log);
      return "delivered";
    }
    const lastError = (res.error ?? (res.body.trim() ? `HTTP ${res.status}: ${res.body.trim()}` : `HTTP ${res.status}`)).slice(0, 300);
    if (attempt >= MAX_ATTEMPTS || tooOld) {
      await finish(ev, { status: "failed", attempts: attempt, lastStatus: res.status, lastError });
      logger.warn("webhook failed for good", { ...log, error: lastError });
      return "failed";
    }
    await finish(ev, {
      attempts: attempt,
      lastStatus: res.status,
      lastError,
      nextAttemptAt: new Date(Date.now() + RETRY_DELAYS_MS[attempt - 1]),
    });
    logger.info("webhook will be retried", { ...log, error: lastError });
    return "retry";
  } catch (e) {
    // Our own problem (database, unreadable secret…): try again in a minute, without counting an attempt.
    logger.error("webhook delivery error", { eventId: ev.id, error: (e as Error).message });
    await finish(ev, { nextAttemptAt: new Date(Date.now() + 60_000) }).catch(() => {});
    return "retry";
  }
}

/** Claim and send everything that is due. Returns how many events were tried. */
export async function deliverDue(limit = 20): Promise<number> {
  const events = await claimDue(limit);
  await Promise.all(events.map(deliver));
  return events.length;
}

// ---------- sweep ----------

/**
 * Queue "invoice.paid" for signed invoices that were paid but have no event, in case writing it in
 * markPaid ever failed. Safe to run any time: unique(type, invoice_id) keeps it to one per invoice.
 */
export async function sweepMissedEvents(): Promise<number> {
  const db = await getDb();
  const res = await db.execute(sql`
    INSERT INTO webhook_events (id, merchant_address, type, invoice_id)
    SELECT 'evt_' || substr(md5(random()::text || i.id), 1, 16), i.merchant_address, 'invoice.paid', i.id
    FROM invoices i
    WHERE i.integration_id IS NOT NULL
      AND i.status = 'paid'
      AND NOT i.is_demo
      AND i.created_at > now() - interval '14 days'
      AND NOT EXISTS (SELECT 1 FROM webhook_events e WHERE e.type = 'invoice.paid' AND e.invoice_id = i.id)
    ON CONFLICT DO NOTHING
  `);
  return (res as { affectedRows?: number; rowCount?: number }).affectedRows ?? (res as { rowCount?: number }).rowCount ?? 0;
}
