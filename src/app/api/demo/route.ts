import { and, eq, gt, sql } from "drizzle-orm";
import { fail, handle, json } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { createInvoice, publicInvoice } from "@/lib/invoices";
import { normalizeAddress } from "@/lib/nimiq-address";

// "Try it" — creates a tiny sample invoice anyone can pay end-to-end in a few seconds.
export const POST = handle(async () => {
  const address = normalizeAddress(process.env.DEMO_MERCHANT_ADDRESS || "");
  if (!address) return fail("The demo is not configured on this server.", 503);
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.isDemo, true), gt(schema.invoices.createdAt, new Date(Date.now() - 60_000))));
  if (n > 30) return fail("Lots of people are trying the demo right now. Please try again in a minute.", 429);
  const inv = await createInvoice({
    merchantAddress: address,
    merchantName: process.env.DEMO_MERCHANT_NAME || "Ada Studio (sample freelancer)",
    merchantEvmAddress: process.env.DEMO_MERCHANT_EVM_ADDRESS || null,
    clientName: "You",
    items: [
      { description: "Logo concept sketch (sample)", quantity: 1, unitPrice: 0.03 },
      { description: "Revision round (sample)", quantity: 1, unitPrice: 0.02 },
    ],
    currency: "USD",
    note: "This is a sample invoice so you can try NimBill end-to-end. It costs about 200 NIM (≈ $0.05).",
    isDemo: true,
  });
  return json({ invoice: publicInvoice(inv) }, 201);
});
