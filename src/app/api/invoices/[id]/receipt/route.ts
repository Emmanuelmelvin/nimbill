import { NextResponse, type NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { getSessionAddress } from "@/lib/auth";
import { mail } from "@/lib/clients";
import { corsPreflight, withCors } from "@/lib/cors";
import { Errors } from "@/lib/errors";
import { claimReceiptEmail, getInvoice } from "@/lib/invoices";
import { sendPayerReceiptEmail } from "@/lib/notifications";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { buildReceiptPdf } from "@/lib/receipt-pdf";
import { ReceiptEmailBody } from "@/lib/schemas";

export const OPTIONS = corsPreflight(["GET", "POST"]);

/** Download a paid invoice's receipt as a standalone PDF file. */
export const GET = withCors(
  ["GET"],
  handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const inv = await getInvoice(id);
    if (!inv) throw Errors.notFound("Invoice not found.");
    if (inv.status !== "paid") throw Errors.badRequest("This invoice has not been paid yet, so there is no receipt.");
    const pdf = buildReceiptPdf(inv);
    const inline = req.nextUrl.searchParams.get("inline") === "1";
    const filename = `NimBill-Receipt-${inv.number.replace(/[^A-Za-z0-9_-]/g, "-")}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
        "cache-control": "private, max-age=300",
      },
    });
  }),
);

// This endpoint needs no sign-in (the payer usually has none), so it is limited three ways to keep
// it from being used to send NimBill emails to arbitrary addresses: per caller, per invoice (a
// durable count on the invoice), and to the week after payment (the merchant can always resend).
const MAX_RECEIPT_EMAILS = 3;
const RECEIPT_WINDOW_MS = 7 * 24 * 3_600_000;

/** Email the paid invoice and PDF receipt to the payer if they entered their email after paying. */
export const POST = withCors(
  ["POST"],
  handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    rateLimit(`receipt-email:${clientIp(req.headers)}`, 5, 3_600_000, "Too many receipt emails. Please try again later.");
    const { id } = await ctx.params;
    const { email } = ReceiptEmailBody.parse(await req.json());
    const inv = await getInvoice(id);
    if (!inv) throw Errors.notFound("Invoice not found.");
    if (inv.status !== "paid") throw Errors.badRequest("This invoice has not been paid yet.");
    if (!mail.configured || inv.isDemo) return json({ ok: true, sent: false, configured: mail.configured });

    const viewer = await getSessionAddress();
    const isOwner = !!viewer && viewer === inv.merchantAddress;
    if (!isOwner && inv.paidAt && Date.now() - inv.paidAt.getTime() > RECEIPT_WINDOW_MS) {
      throw Errors.badRequest("Receipts can only be emailed in the week after payment. Download the PDF instead.");
    }

    const claimed = await claimReceiptEmail(inv.id, email, MAX_RECEIPT_EMAILS);
    if (!claimed) {
      throw Errors.rateLimited("This receipt has already been emailed several times. Download the PDF instead.");
    }
    const sent = await sendPayerReceiptEmail(claimed, email);
    return json({ ok: true, sent, configured: mail.configured });
  }),
);
