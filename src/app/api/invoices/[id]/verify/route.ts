import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { getInvoice, publicInvoice, verifyPayment } from "@/lib/invoices";
import { VerifyBody } from "@/lib/schemas";

// Check the blockchain for the payment. The client polls this after sending.
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/invoices/[id]/verify">) => {
  const { id } = await ctx.params;
  const { asset, txHash } = VerifyBody.parse(await req.json());
  const inv = await getInvoice(id);
  if (!inv) throw Errors.notFound("Invoice not found.");
  const r = await verifyPayment(inv, asset, txHash);
  if (r.status === "paid") return json({ status: "paid", invoice: publicInvoice(r.invoice) });
  return json(r);
});
