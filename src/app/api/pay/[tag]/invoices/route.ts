import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { getSessionAddress } from "@/lib/auth";
import { createBoardInvoice } from "@/lib/board-server";
import { publicInvoice } from "@/lib/invoices";
import { BoardInvoiceBody } from "@/lib/schemas";

// Public: start paying on a board. Returns the invoice to pay, at /i/<id>, like any other invoice.
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/pay/[tag]/invoices">) => {
  const { tag } = await ctx.params;
  const body = BoardInvoiceBody.parse(await req.json());
  const inv = await createBoardInvoice(decodeURIComponent(tag), body, await getSessionAddress());
  return json({ invoice: publicInvoice(inv) }, 201);
});
