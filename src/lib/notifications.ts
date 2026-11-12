import "server-only";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { mail, type MailMessage } from "./clients";
import { formatAsset, formatFiat } from "./currencies";
import { getDb, schema } from "./db";
import type { Invoice } from "./db/schema";
import { AppError } from "./errors";
import { logger } from "./logger";
import { siteUrl } from "./site";

// Emails NimBill sends to merchants. The merchant's address is private: it is read here at send
// time, never copied onto invoices, never logged and never part of PublicInvoice.

/**
 * Tell the merchant their invoice was paid, if they saved an email in Settings and mail is set up.
 *
 * Call this exactly once per invoice, right after the unpaid -> paid update succeeds (markPaid in
 * lib/invoices.ts). It returns immediately: the email goes out after the response is sent, and a
 * failure is only logged. Payment confirmation never waits for, or fails because of, an email.
 */
export function notifyInvoicePaid(inv: Invoice): void {
  // Sample invoices from "Try it" are not real business (the dashboard hides them too).
  if (!mail.configured || inv.isDemo) return;
  const task = async () => {
    try {
      const sent = await sendPaidEmail(inv);
      if (sent) logger.info("paid email sent", { invoiceId: inv.id });
    } catch (e) {
      const err = e as Error;
      logger.warn("paid email failed", {
        invoiceId: inv.id,
        error: err.message,
        ...(AppError.is(err) ? { code: err.code, details: err.details } : {}),
      });
    }
  };
  try {
    after(task); // keeps a serverless function alive until the email is handed over
  } catch {
    void task(); // not inside a request (scripts, tests): send in the background
  }
}

async function sendPaidEmail(inv: Invoice): Promise<boolean> {
  const db = await getDb();
  // Read the address now rather than when the invoice was created, so changing or clearing it in
  // Settings takes effect for every later payment.
  const [merchant] = await db
    .select({ email: schema.merchants.email })
    .from(schema.merchants)
    .where(eq(schema.merchants.address, inv.merchantAddress));
  if (!merchant?.email) return false;
  await mail.send({ to: merchant.email, ...paidEmail(inv), idempotencyKey: `invoice-paid/${inv.id}` });
  return true;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Client names are typed by the merchant; keep them on one line in the subject. */
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** The "invoice paid" message. Exported so the wording can be checked without sending anything. */
export function paidEmail(inv: Invoice): Omit<MailMessage, "to"> {
  const client = oneLine(inv.clientName);
  const amount = formatFiat(inv.total, inv.currency);
  const tip = Number(inv.paidTip ?? 0);
  const received = inv.paidAsset && inv.paidAmount ? formatAsset(inv.paidAmount, inv.paidAsset) : "";
  const paidAt = inv.paidAt
    ? `${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(inv.paidAt)} UTC`
    : "";
  const url = new URL(`/i/${inv.id}`, siteUrl()).toString();

  const rows: [string, string][] = [
    ["Invoice", inv.number],
    ["Client", client],
    ["Amount", amount],
  ];
  if (tip > 0) rows.push(["Tip", formatFiat(tip, inv.currency)]);
  if (received) rows.push(["Received", received]);
  if (paidAt) rows.push(["Paid", paidAt]);

  const subject = `${inv.number} paid: ${amount} from ${client}`;
  const intro =
    tip > 0
      ? `${client} paid invoice ${inv.number} and added a ${formatFiat(tip, inv.currency)} tip.`
      : `${client} paid invoice ${inv.number}.`;
  const outro = "The payment went straight to your wallet and was verified on-chain.";
  const why = "You get this email because your address is saved in NimBill Settings. Remove it there to stop these emails.";

  const text = [intro, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `View the invoice: ${url}`, "", outro, "", why].join("\n");

  // Plain black and white with sharp edges, like the app. Inline styles only: mail clients drop <style>.
  const cell = "padding:10px 0;border-bottom:1px solid #e5e5e5;font-size:15px;";
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#ffffff;color:#000000;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:480px;margin:0 auto;">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#666666;">NimBill</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${escapeHtml(intro)}</h1>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-top:1px solid #000000;">
${rows
  .map(
    ([k, v]) =>
      `<tr><td style="${cell}color:#666666;">${escapeHtml(k)}</td><td style="${cell}text-align:right;font-weight:600;">${escapeHtml(v)}</td></tr>`,
  )
  .join("\n")}
</table>
<p style="margin:24px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 24px;background:#000000;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">View invoice</a></p>
<p style="margin:0 0 16px;font-size:14px;color:#000000;">${escapeHtml(outro)}</p>
<p style="margin:0;font-size:12px;color:#666666;">${escapeHtml(why)}</p>
</div>
</body>
</html>`;

  return { subject, text, html };
}
