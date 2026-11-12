import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { getSessionAddress } from "@/lib/auth";
import { corsPreflight, withCors } from "@/lib/cors";
import { createBoardInvoice } from "@/lib/board-server";
import { publicInvoice } from "@/lib/invoices";
import { BoardInvoiceBody } from "@/lib/schemas";

// Public: start paying on a board. Returns the invoice to pay, at /i/<id>, like any other invoice.
// Open to other sites (CORS). Requests from them carry no NimBill session, so they're anonymous.
export const OPTIONS = corsPreflight(["POST"]);
export const POST = withCors(
  ["POST"],
  handle(async (req: NextRequest, ctx: RouteContext<"/api/pay/[tag]/invoices">) => {
    const { tag } = await ctx.params;
    const body = BoardInvoiceBody.parse(await req.json());
    const inv = await createBoardInvoice(decodeURIComponent(tag), body, await getSessionAddress());
    return json({ invoice: publicInvoice(inv) }, 201);
  }),
);
