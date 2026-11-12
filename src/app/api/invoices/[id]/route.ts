import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { getSessionAddress, requireSessionAddress } from "@/lib/auth";
import { corsPreflight, withCors } from "@/lib/cors";
import { Errors } from "@/lib/errors";
import { cancelInvoice, getInvoice, publicInvoice, reconcileMerchant } from "@/lib/invoices";

// Reading an invoice is open to other sites (CORS), for agents; cancelling it (DELETE) is not.
export const OPTIONS = corsPreflight(["GET"]);
export const GET = withCors(
  ["GET"],
  handle(async (_req: NextRequest, ctx: RouteContext<"/api/invoices/[id]">) => {
    const { id } = await ctx.params;
    let inv = await getInvoice(id);
    if (!inv) throw Errors.notFound("Invoice not found. Check the link.");
    if (inv.status === "unpaid") {
      // Cheap recovery path: payment may have landed while nobody was watching.
      if ((await reconcileMerchant(inv.merchantAddress, [inv.id])) > 0) inv = (await getInvoice(id))!;
    }
    const me = await getSessionAddress();
    return json({ invoice: publicInvoice(inv), isOwner: me === inv.merchantAddress });
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
