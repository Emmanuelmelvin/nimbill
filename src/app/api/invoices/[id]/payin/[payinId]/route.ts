import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { corsPreflight, withCors } from "@/lib/cors";
import { AppError, Errors } from "@/lib/errors";
import { getInvoice, publicInvoice } from "@/lib/invoices";
import { logger } from "@/lib/logger";
import { advancePayin, getPayin, publicPayin } from "@/lib/payin/service";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// Where a payment from another chain stands. The pay screen polls this; each call also moves the
// payment forward (and marks the invoice paid once the USDT has reached the merchant).
export const OPTIONS = corsPreflight(["GET"]);
export const GET = withCors(
  ["GET"],
  handle(async (req: NextRequest, ctx: RouteContext<"/api/invoices/[id]/payin/[payinId]">) => {
    const { id, payinId } = await ctx.params;
    rateLimit(`payin-status:${clientIp(req.headers)}`, 60, 60_000);
    let p = await getPayin(payinId);
    if (!p || p.invoiceId !== id) throw Errors.notFound("Payment not found.");
    try {
      p = await advancePayin(p);
    } catch (e) {
      // 1Click or Polygon didn't answer: show the last known state, the next poll tries again.
      logger.warn("payin status check failed", { payin: p.id, error: (e as Error).message, code: AppError.is(e) ? e.code : undefined });
    }
    const inv = p.status === "paid" ? await getInvoice(id) : null;
    return json({ payin: publicPayin(p), invoice: inv ? publicInvoice(inv) : null });
  }),
);
