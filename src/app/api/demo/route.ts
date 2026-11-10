import { and, eq, gt, sql } from "drizzle-orm";
import { handle, json } from "@/lib/api";
import { env } from "@/lib/env";
import { AppError, Errors } from "@/lib/errors";
import { getDb, schema } from "@/lib/db";
import { createInvoice, publicInvoice } from "@/lib/invoices";
import { normalizeAddress } from "@/lib/nimiq-address";

// "Try it" — creates a tiny sample invoice anyone can pay end-to-end in a few seconds.
export const POST = handle(async () => {
  const address = normalizeAddress(env.DEMO_MERCHANT_ADDRESS || "");
  if (!address) throw new AppError("CONFIG", "The demo is not configured on this server.", { status: 503, expose: true });
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.isDemo, true), gt(schema.invoices.createdAt, new Date(Date.now() - 60_000))));
  if (n > 30) throw Errors.rateLimited("Lots of people are trying the demo right now. Please try again in a minute.");
  const inv = await createInvoice({
    merchantAddress: address,
    merchantName: env.DEMO_MERCHANT_NAME || "Ada Studio (sample freelancer)",
    merchantEvmAddress: env.DEMO_MERCHANT_EVM_ADDRESS || null,
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
