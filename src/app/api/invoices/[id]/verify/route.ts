import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, handle, json } from "@/lib/api";
import { getInvoice, publicInvoice, verifyPayment } from "@/lib/invoices";

const Body = z.object({ asset: z.enum(["NIM", "USDT"]), txHash: z.string().trim().max(80) });

// Check the blockchain for the payment. The client polls this after sending.
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/invoices/[id]/verify">) => {
  const { id } = await ctx.params;
  const { asset, txHash } = Body.parse(await req.json());
  const inv = await getInvoice(id);
  if (!inv) return fail("Invoice not found.", 404);
  const r = await verifyPayment(inv, asset, txHash);
  if (r.status === "paid") return json({ status: "paid", invoice: publicInvoice(r.invoice) });
  return json(r);
});
