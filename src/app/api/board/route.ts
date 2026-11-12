import { and, eq, gt } from "drizzle-orm";
import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { reconcileMerchant } from "@/lib/invoices";
import { invoiceUsd, prepareLedger } from "@/lib/ledger";
import { listProducts } from "@/lib/products";

const DAY = 86_400_000;

// The owner's board at a glance: what came in through it in the last 30 days, and how many products are on it.
export const GET = handle(async () => {
  const address = await requireSessionAddress();
  await reconcileMerchant(address);
  const { fx, currency } = await prepareLedger(address);
  const db = await getDb();
  const paid = await db
    .select()
    .from(schema.invoices)
    .where(
      and(
        eq(schema.invoices.merchantAddress, address),
        eq(schema.invoices.source, "board"),
        eq(schema.invoices.status, "paid"),
        gt(schema.invoices.paidAt, new Date(Date.now() - 30 * DAY)),
      ),
    );
  const products = await listProducts(address, true);
  return json({
    last30: { orders: paid.length, usd: paid.reduce((s, i) => s + (invoiceUsd(i, fx) ?? 0), 0) },
    liveProducts: products.length,
    fx,
    currency,
  });
});
