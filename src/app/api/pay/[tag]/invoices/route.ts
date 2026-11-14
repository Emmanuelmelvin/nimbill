import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { getSessionAddress } from "@/lib/auth";
import { corsPreflight, withCors } from "@/lib/cors";
import { createBoardInvoice } from "@/lib/board-server";
import { publicInvoice } from "@/lib/invoices";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { BoardInvoiceBody } from "@/lib/schemas";
import { ANON_INVOICES_PER_IP_PER_MIN } from "@/lib/webhook-policy";
import { SIGNATURE_HEADER } from "@/lib/webhook-signature";

// Public: start paying on a board. Returns the invoice to pay, at /i/<id>, like any other invoice.
// Open to other sites (CORS). Requests from them carry no NimBill session, so they're anonymous.
//
// "Pay with NimBill": the merchant's store signs the request with its webhook secret
// (NimBill-Signature header over the raw body). Then `reference`, `metadata` and `returnUrl` are
// accepted, the invoice is tied to the store, and paying it sends the store a webhook.
export const OPTIONS = corsPreflight(["POST"]);
export const POST = withCors(
  ["POST"],
  handle(async (req: NextRequest, ctx: RouteContext<"/api/pay/[tag]/invoices">) => {
    const { tag } = await ctx.params;
    const rawBody = await req.text(); // the signature covers these exact bytes
    const header = req.headers.get(SIGNATURE_HEADER);
    // Anonymous callers also get a per-IP allowance, so one client can't use up a whole board's.
    if (!header) rateLimit(`board-invoice:${clientIp(req.headers)}`, ANON_INVOICES_PER_IP_PER_MIN, 60_000);
    const body = BoardInvoiceBody.parse(JSON.parse(rawBody));
    const inv = await createBoardInvoice(
      decodeURIComponent(tag),
      body,
      header ? null : await getSessionAddress(),
      header ? { header, rawBody } : null,
    );
    return json({ invoice: publicInvoice(inv) }, 201);
  }),
);
