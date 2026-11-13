import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { getSessionAddress, requireSessionAddress } from "@/lib/auth";
import { corsPreflight, withCors } from "@/lib/cors";
import { Errors } from "@/lib/errors";
import { cancelInvoice, getInvoice, markViewed, publicInvoice, reconcileMerchant } from "@/lib/invoices";

// Reading an invoice is open to other sites (CORS), for agents; cancelling it (DELETE) is not.
export const OPTIONS = corsPreflight(["GET"]);
export const GET = withCors(
  ["GET"],
  handle(async (req: NextRequest, ctx: RouteContext<"/api/invoices/[id]">) => {
    const { id } = await ctx.params;
    let inv = await getInvoice(id);
    if (!inv) throw Errors.notFound("Invoice not found. Check the link.");
    if (inv.status === "unpaid") {
      // Cheap recovery path: payment may have landed while nobody was watching.
      if ((await reconcileMerchant(inv.merchantAddress, [inv.id])) > 0) inv = (await getInvoice(id))!;
    }
    const me = await getSessionAddress();
    const isOwner = me === inv.merchantAddress;
    // "?view=1" is sent only by the invoice page, so API callers, link-preview bots and the
    // merchant themselves never count as the client opening it.
    if (!isOwner && req.nextUrl.searchParams.get("view") === "1") inv = await markViewed(inv);
    return json({
      invoice: publicInvoice(inv),
      isOwner,
      // Private to the merchant: when the client first opened the invoice, and their email (for reminders).
      viewedAt: isOwner ? (inv.viewedAt?.toISOString() ?? null) : null,
      clientEmail: isOwner ? inv.clientEmail : null,
    });
  }),
);

// Cancel an unpaid invoice (owner only).
export const DELETE = handle(async (_req: NextRequest, ctx: RouteContext<"/api/invoices/[id]">) => {
  const { id } = await ctx.params;
  const me = await requireSessionAddress();
  const ok = await cancelInvoice(id, me);
  if (!ok) throw Errors.badRequest("Only unpaid invoices you created can be cancelled.");
  return json({ invoice: publicInvoice((await getInvoice(id))!) });
});
