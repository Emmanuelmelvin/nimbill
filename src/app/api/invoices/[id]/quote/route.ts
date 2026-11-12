import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { corsPreflight, withCors } from "@/lib/cors";
import { Errors } from "@/lib/errors";
import { createQuote, getInvoice, paymentMemo } from "@/lib/invoices";
import { metrics } from "@/lib/observability";
import { QuoteBody } from "@/lib/schemas";

// Lock the exchange rate for 5 minutes and return the exact amount to pay.
// Open to other sites (CORS), for agents.
export const OPTIONS = corsPreflight(["POST"]);
export const POST = withCors(
  ["POST"],
  handle(async (req: NextRequest, ctx: RouteContext<"/api/invoices/[id]/quote">) => {
    const { id } = await ctx.params;
    const { asset, tip } = QuoteBody.parse(await req.json());
    const inv = await getInvoice(id);
    if (!inv) throw Errors.notFound("Invoice not found.");
    const q = await createQuote(inv, asset, tip);
    metrics.quoteCreated(asset);
    return json({
      quote: {
        id: q.id,
        asset: q.asset,
        amount: q.amount,
        rate: q.rate,
        tip: q.tip,
        expiresAt: q.expiresAt.toISOString(),
        recipient: asset === "NIM" ? inv.merchantAddress : inv.merchantEvmAddress,
        memo: paymentMemo(inv.id),
      },
    });
  }),
);
