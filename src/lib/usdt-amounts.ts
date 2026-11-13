import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { Errors } from "./errors";

// USDT (an ERC-20 token on Polygon) can't carry a reference the way a NIM transaction carries its
// memo. So every USDT amount NimBill asks someone to send, for an invoice or a tag transfer, gets a
// tag of 0.000001–0.009999 USDT on top of a price already rounded up to the cent, chosen so that no
// other payable amount to the same wallet uses it at the same time. The exact amount received then
// points to one invoice or one transfer, never both, and the recipient still gets at least the price.

/** How long a USDT price stays valid: an invoice quote, or a transfer the sender just started. */
export const PRICE_LOCK_MS = 5 * 60 * 1000;
/** A payment broadcast just before the lock ends still counts if it lands within this window. */
export const PRICE_LOCK_GRACE_MS = 3 * 60 * 1000;
/** Allowed clock skew between the server and the block a payment landed in. */
export const CLOCK_SKEW_MS = 60_000;

const USDT_TAG_MAX = 9_999;

/**
 * `base` (in 6-decimal USDT units) plus a tag no other open USDT amount to `evmAddress` uses:
 * neither an invoice quote nor a tag transfer whose payment window overlaps this one.
 */
export async function uniqueUsdtAmount(evmAddress: string, base: bigint): Promise<bigint> {
  const db = await getDb();
  const addr = evmAddress.toLowerCase();
  // Anything whose window (lock + grace) ends after this one's window starts.
  const windowStart = Date.now() - PRICE_LOCK_GRACE_MS - CLOCK_SKEW_MS;
  const [quotes, transfers] = await Promise.all([
    db
      .select({ amount: schema.quotes.amount })
      .from(schema.quotes)
      .innerJoin(schema.invoices, eq(schema.quotes.invoiceId, schema.invoices.id))
      .where(
        and(
          eq(schema.quotes.asset, "USDT"),
          sql`lower(${schema.invoices.merchantEvmAddress}) = ${addr}`,
          gt(schema.quotes.expiresAt, new Date(windowStart)),
        ),
      ),
    db
      .select({ amount: schema.transfers.amount })
      .from(schema.transfers)
      .where(
        and(
          eq(schema.transfers.asset, "USDT"),
          sql`lower(${schema.transfers.toEvmAddress}) = ${addr}`,
          // A transfer's lock starts when it is created.
          gt(schema.transfers.createdAt, new Date(windowStart - PRICE_LOCK_MS)),
        ),
      ),
  ]);
  const taken = new Set([...quotes, ...transfers].map((a) => a.amount));
  const rand = new Uint32Array(64);
  crypto.getRandomValues(rand);
  for (const r of rand) {
    const amount = base + BigInt(1 + (r % USDT_TAG_MAX));
    if (!taken.has(amount.toString())) return amount;
  }
  throw Errors.rateLimited("Lots of USDT payments to this wallet are in progress right now. Please try again in a minute.");
}

/**
 * Whether a transaction already counts as an invoice payment or a tag transfer. Each table only
 * enforces its own unique hash, so one transaction could otherwise count once in each.
 */
export async function txHashUsed(hash: string): Promise<boolean> {
  const db = await getDb();
  const h = hash.toLowerCase();
  const [inv, tr] = await Promise.all([
    db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.paidTxHash, h)).limit(1),
    db.select({ id: schema.transfers.id }).from(schema.transfers).where(eq(schema.transfers.txHash, h)).limit(1),
  ]);
  return inv.length > 0 || tr.length > 0;
}
