import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, handle, json } from "@/lib/api";
import { createQuote, getInvoice, paymentMemo } from "@/lib/invoices";

const Body = z.object({ asset: z.enum(["NIM", "USDT"]) });

// Lock the exchange rate for 5 minutes and return the exact amount to pay.
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/invoices/[id]/quote">) => {
  const { id } = await ctx.params;
  const { asset } = Body.parse(await req.json());
  const inv = await getInvoice(id);
  if (!inv) return fail("Invoice not found.", 404);
  const q = await createQuote(inv, asset);
  return json({
    quote: {
      id: q.id,
      asset: q.asset,
      amount: q.amount,
      rate: q.rate,
      expiresAt: q.expiresAt.toISOString(),
      recipient: asset === "NIM" ? inv.merchantAddress : inv.merchantEvmAddress,
      memo: paymentMemo(inv.id),
    },
  });
});
