import "server-only";
import { and, eq, gt, isNotNull } from "drizzle-orm";
import { getDb, schema } from "./db";
import { reconcileMerchant } from "./invoices";
import { logger } from "./logger";

// Payments to store invoices are noticed even when nobody is looking.
//
// The web app only checks the chain when someone asks: the payer's page polls, or the merchant
// opens their dashboard. A shopper who pays and closes the tab would leave a store waiting. The
// worker therefore looks for these payments itself, with the same matching rules (reconcileMerchant
// -> markPaid, which also queues the webhook).
//
// Only invoices that can still be paid are watched: a payment only counts within a price lock (plus
// its grace period), so an invoice with no recent lock can't become paid and is left alone. That
// keeps the work small however many invoices exist.

/** How long after a price lock ends a payment can still show up (grace + time to confirm). */
const WATCH_AFTER_LOCK_MS = 30 * 60_000;

/** Check the chain for every store invoice that is waiting on a payment. Returns how many got paid. */
export async function watchStoreInvoices(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ merchant: schema.invoices.merchantAddress, id: schema.invoices.id })
    .from(schema.invoices)
    .innerJoin(schema.quotes, eq(schema.quotes.invoiceId, schema.invoices.id))
    .where(
      and(
        isNotNull(schema.invoices.integrationId),
        eq(schema.invoices.status, "unpaid"),
        gt(schema.quotes.expiresAt, new Date(Date.now() - WATCH_AFTER_LOCK_MS)),
      ),
    );
  if (!rows.length) return 0;

  const byMerchant = new Map<string, string[]>();
  for (const r of rows) byMerchant.set(r.merchant, [...(byMerchant.get(r.merchant) ?? []), r.id]);

  let paid = 0;
  for (const [merchant, ids] of byMerchant) {
    try {
      paid += await reconcileMerchant(merchant, ids);
    } catch (e) {
      // One merchant's RPC trouble shouldn't stop the others; the next round tries again.
      logger.warn("watch: reconcile failed", { invoices: ids.length, error: (e as Error).message });
    }
  }
  if (paid) logger.info("watch: payments found", { paid });
  return paid;
}
