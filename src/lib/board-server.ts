import "server-only";
import { and, count, desc, eq, gt, inArray, or } from "drizzle-orm";
import type { z } from "zod";
import { merchantAvatarUrl } from "./avatars";
import { getDb, schema } from "./db";
import type { Invoice } from "./db/schema";
import { Errors } from "./errors";
import { createInvoice } from "./invoices";
import { listProducts, productView } from "./products";
import type { BoardInvoiceBody } from "./schemas";
import { formatTag, normalizeTag, tagProblem } from "./tags";

const MINUTE = 60_000;
/** Most invoices visitors may start on one board in 10 minutes, so nobody can flood it. */
const MAX_STARTED_PER_10_MIN = 30;
/** Unpaid board invoices older than this are no longer shown to the owner. */
export const PENDING_ORDER_DAYS = 7;

async function boardOwner(rawTag: string) {
  const tag = normalizeTag(rawTag);
  if (tagProblem(tag)) return null;
  const db = await getDb();
  const [m] = await db.select().from(schema.merchants).where(eq(schema.merchants.tag, tag));
  return m?.tag && m.name ? m : null;
}

/** Everything a visitor sees on a board: who they're paying, what they can buy and how. */
export async function getPublicBoard(rawTag: string) {
  const m = await boardOwner(rawTag);
  if (!m) return null;
  const products = await listProducts(m.address, true);
  return {
    merchant: {
      tag: m.tag!,
      handle: formatTag(m.tag!),
      name: m.name,
      bio: m.bio,
      address: m.address,
      acceptsUsdt: !!m.evmAddress,
      openAmounts: m.boardOpenAmounts,
      avatarUrl: merchantAvatarUrl(m),
    },
    products: products.map(productView),
  };
}
export type PublicBoard = NonNullable<Awaited<ReturnType<typeof getPublicBoard>>>;

/**
 * A visitor starts paying on a board: make the invoice they will pay. It doesn't count against the
 * merchant's invoice numbers until it's paid, and the owner only sees it under Board → Orders.
 */
export async function createBoardInvoice(
  rawTag: string,
  input: z.output<typeof BoardInvoiceBody>,
  visitor: string | null,
): Promise<Invoice> {
  const m = await boardOwner(rawTag);
  if (!m) throw Errors.notFound("No one has that tag. Check the link.");
  if (visitor === m.address) throw Errors.badRequest("This is your own board. Share the link with whoever is paying you.");

  const db = await getDb();
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.invoices)
    .where(
      and(
        eq(schema.invoices.merchantAddress, m.address),
        eq(schema.invoices.source, "board"),
        gt(schema.invoices.createdAt, new Date(Date.now() - 10 * MINUTE)),
      ),
    );
  if (n >= MAX_STARTED_PER_10_MIN)
    throw Errors.rateLimited("Lots of people are paying this board right now. Please try again in a few minutes.");

  const base = {
    merchantAddress: m.address,
    merchantName: m.name,
    merchantEvmAddress: m.evmAddress,
    clientName: input.payerName,
    source: "board" as const,
  };

  if (input.productId) {
    const [p] = await db
      .select()
      .from(schema.products)
      .where(
        and(eq(schema.products.id, input.productId), eq(schema.products.merchantAddress, m.address), eq(schema.products.active, true)),
      );
    if (!p) throw Errors.notFound("That product isn't available anymore.");
    return createInvoice({
      ...base,
      productId: p.id,
      currency: p.currency,
      items: [{ description: p.name, quantity: input.quantity ?? 1, unitPrice: Number(p.price) }],
    });
  }

  if (!m.boardOpenAmounts) throw Errors.badRequest("This board only takes payments for its products.");
  return createInvoice({
    ...base,
    currency: input.currency!,
    items: [{ description: input.description!, quantity: 1, unitPrice: input.amount! }],
  });
}

/** The owner's board orders: every paid one, and unpaid ones from the last week, newest first. */
export async function listBoardOrders(merchantAddress: string): Promise<Invoice[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.invoices)
    .where(
      and(
        eq(schema.invoices.merchantAddress, merchantAddress),
        eq(schema.invoices.source, "board"),
        or(
          eq(schema.invoices.status, "paid"),
          and(
            eq(schema.invoices.status, "unpaid"),
            gt(schema.invoices.createdAt, new Date(Date.now() - PENDING_ORDER_DAYS * 24 * 60 * MINUTE)),
          ),
        ),
      ),
    )
    .orderBy(desc(schema.invoices.createdAt))
    .limit(200);
}

/** How many times each product was bought and paid for. */
export async function soldCounts(productIds: string[]): Promise<Record<string, number>> {
  if (!productIds.length) return {};
  const db = await getDb();
  const rows = await db
    .select({ productId: schema.invoices.productId, n: count() })
    .from(schema.invoices)
    .where(and(inArray(schema.invoices.productId, productIds), eq(schema.invoices.status, "paid")))
    .groupBy(schema.invoices.productId);
  return Object.fromEntries(rows.map((r) => [r.productId!, r.n]));
}
