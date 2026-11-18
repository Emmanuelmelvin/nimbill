import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { mail } from "@/lib/clients";
import { corsPreflight, withCors } from "@/lib/cors";
import { getDb, schema } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { getInvoice } from "@/lib/invoices";
import { sendPayerReceiptEmail } from "@/lib/notifications";
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

/** Email the paid invoice and PDF receipt to the payer if they entered their email after paying. */
export const POST = withCors(
  ["POST"],
  handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const { email } = ReceiptEmailBody.parse(await req.json());
    const inv = await getInvoice(id);
    if (!inv) throw Errors.notFound("Invoice not found.");
    if (inv.status !== "paid") throw Errors.badRequest("This invoice has not been paid yet.");
    const db = await getDb();
    const [updated] = await db
      .update(schema.invoices)
      .set({ payerEmail: email })
      .where(eq(schema.invoices.id, inv.id))
      .returning();
    const target = updated ?? inv;
    const sent = mail.configured && !target.isDemo ? await sendPayerReceiptEmail(target, email) : false;
    return json({ ok: true, sent, configured: mail.configured });
  }),
);
