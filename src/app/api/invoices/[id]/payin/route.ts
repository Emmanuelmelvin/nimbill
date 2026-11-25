import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { corsPreflight, withCors } from "@/lib/cors";
import { Errors } from "@/lib/errors";
import { getInvoice } from "@/lib/invoices";
import { publicPayin, startPayin } from "@/lib/payin/service";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { PayinStartBody } from "@/lib/schemas";

// "Pay from another chain": lock a USDT price for the invoice and get a one-time deposit address on
// the chain the client pays from. Open to other sites (CORS), for agents, like the quote endpoint.
export const OPTIONS = corsPreflight(["POST"]);
export const POST = withCors(
  ["POST"],
  handle(async (req: NextRequest, ctx: RouteContext<"/api/invoices/[id]/payin">) => {
    const { id } = await ctx.params;
    rateLimit(`payin-start:${clientIp(req.headers)}`, 10, 10 * 60_000, "Too many payment addresses asked for. Please wait a few minutes.");
    rateLimit(`payin-start-inv:${id}`, 20, 60 * 60_000, "Too many payment addresses for this invoice. Please wait a while.");
    const body = PayinStartBody.parse(await req.json());
    const inv = await getInvoice(id);
    if (!inv) throw Errors.notFound("Invoice not found.");
    const p = await startPayin(inv, { sourceId: body.source, refundTo: body.refundTo, tip: body.tip, payerEmail: body.payerEmail });
    return json({ payin: publicPayin(p) });
  }),
);
