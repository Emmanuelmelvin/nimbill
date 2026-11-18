import "server-only";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { mail, type MailMessage } from "./clients";
import { formatAsset, formatFiat } from "./currencies";
import { getDb, schema } from "./db";
import type { Invoice, RecurringInterval, RecurringInvoice } from "./db/schema";
import { AppError } from "./errors";
import { logger } from "./logger";
import { nimbillNumber } from "./nimbill-number";
import { buildReceiptPdf } from "./receipt-pdf";
import { recurringUnsubscribePath } from "./recurring";
import { siteUrl } from "./site";

// Emails NimBill sends to merchants and invoice payers. Addresses stay private: never exposed on
// PublicInvoice and never written to logs.

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Client and merchant names are user-supplied; keep them on one line in subjects. */
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Shared top banner image (the first image in README.md, served from `/email-banner.png`) placed at
 * the top of every outgoing email.
 */
export function emailBannerHtml(): string {
  const bannerUrl = new URL("/email-banner.png", siteUrl()).toString();
  // 960×480 (2× the 480px email width, about 66 KB): sharp on high-density screens, light to load.
  return `<img src="${escapeHtml(bannerUrl)}" alt="NimBill: invoice in your currency, get paid in NIM or USDT" width="480" height="240" style="display:block;width:100%;max-width:480px;height:auto;margin:0 0 20px;border:1px solid #000000;" />`;
}

/**
 * Tell the merchant their invoice was paid (if they saved an email in Settings) and email the
 * payer their invoice payment confirmation + downloadable PDF receipt (if the payer or invoice has
 * an email).
 *
 * Call this once per invoice right after the unpaid -> paid update succeeds (markPaid in
 * lib/invoices.ts). It returns immediately: emails go out after the response is sent, and any
 * failure is only logged.
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
    try {
      const payerSent = await sendPayerReceiptEmail(inv);
      if (payerSent) logger.info("payer receipt email sent", { invoiceId: inv.id });
    } catch (e) {
      const err = e as Error;
      logger.warn("payer receipt email failed", {
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

/**
 * Send the paid invoice + PDF receipt email to the payer (`overrideEmail`, `inv.payerEmail`, or
 * `inv.clientEmail`). Returns true when an email was sent.
 */
export async function sendPayerReceiptEmail(inv: Invoice, overrideEmail?: string): Promise<boolean> {
  const to = (overrideEmail ?? inv.payerEmail ?? inv.clientEmail ?? "").trim();
  if (!to || !mail.configured) return false;
  await mail.send({
    to,
    ...payerReceiptEmail(inv),
    idempotencyKey: `invoice-payer-receipt/${inv.id}/${to.toLowerCase()}`,
  });
  return true;
}

/** The merchant's "invoice paid" message. Exported so the wording can be checked without sending anything. */
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
${emailBannerHtml()}
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

/**
 * The invoice payer's confirmation email, including full payment details, a direct link to download
 * the receipt as PDF, and the PDF receipt attached to the email.
 */
export function payerReceiptEmail(inv: Invoice): Omit<MailMessage, "to"> {
  const merchant = oneLine(inv.merchantName);
  const client = oneLine(inv.clientName);
  const amount = formatFiat(inv.total, inv.currency);
  const tip = Number(inv.paidTip ?? 0);
  const paidFiat = Number(inv.total) + tip;
  const totalPaidFormatted = formatFiat(paidFiat, inv.currency);
  const received = inv.paidAsset && inv.paidAmount ? formatAsset(inv.paidAmount, inv.paidAsset) : "";
  const rateNum = Number(inv.paidRate ?? 0);
  const rateText =
    inv.paidAsset && rateNum > 0
      ? `1 ${inv.paidAsset} = ${rateNum < 0.01 ? rateNum.toPrecision(4) : rateNum.toLocaleString("en", { maximumFractionDigits: 4 })} ${inv.currency}`
      : "";
  const paidAt = inv.paidAt
    ? `${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(inv.paidAt)} UTC`
    : "";
  const invoiceUrl = new URL(`/i/${inv.id}`, siteUrl()).toString();
  const receiptUrl = new URL(`/i/${inv.id}/receipt`, siteUrl()).toString();
  const pdfUrl = new URL(`/api/invoices/${inv.id}/receipt`, siteUrl()).toString();

  const rows: [string, string][] = [
    ["Invoice", inv.number],
    ["Paid to", merchant],
    ["Billed to", client],
    ["Amount", amount],
  ];
  if (tip > 0) {
    rows.push(["Tip", formatFiat(tip, inv.currency)]);
    rows.push(["Total paid", totalPaidFormatted]);
  }
  if (received) rows.push(["Paid with", received]);
  if (rateText) rows.push(["Rate used", rateText]);
  if (inv.paidAsset) rows.push(["Network", inv.paidAsset === "USDT" ? "Polygon (USDT)" : "Nimiq"]);
  if (paidAt) rows.push(["Paid", paidAt]);
  if (inv.paidTxHash) rows.push(["Transaction", inv.paidTxHash]);

  const itemLines = inv.items.map(
    (it) =>
      `- ${it.description}${it.quantity !== 1 ? ` (${it.quantity} × ${formatFiat(it.unitPrice, inv.currency)})` : ""}: ${formatFiat(it.quantity * it.unitPrice, inv.currency)}`,
  );

  const subject = `Receipt for ${inv.number}: ${totalPaidFormatted} paid to ${merchant}`;
  const intro =
    tip > 0
      ? `Hi ${client}, your payment of ${totalPaidFormatted} (including a ${formatFiat(tip, inv.currency)} tip) for invoice ${inv.number} to ${merchant} is confirmed on-chain.`
      : `Hi ${client}, your payment of ${amount} for invoice ${inv.number} to ${merchant} is confirmed on-chain.`;
  const outro =
    "Your PDF receipt is attached to this email, and you can also download it as a PDF or view the on-chain receipt anytime using the links above.";
  const why = "You received this email because this address was provided for the invoice receipt on NimBill.";

  const text = [
    intro,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(itemLines.length ? ["", "Items:", ...itemLines] : []),
    "",
    `Download receipt (PDF): ${pdfUrl}`,
    `View receipt online: ${receiptUrl}`,
    `View invoice: ${invoiceUrl}`,
    "",
    outro,
    "",
    why,
  ].join("\n");

  const cell = "padding:10px 0;border-bottom:1px solid #e5e5e5;font-size:15px;";
  const itemsHtml = inv.items.length
    ? `<p style="margin:20px 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#666666;">Items</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-top:1px solid #000000;">
${inv.items
  .map(
    (it) =>
      `<tr><td style="${cell}color:#000000;">${escapeHtml(it.description)}${it.quantity !== 1 ? ` <span style="color:#666666;">× ${it.quantity}</span>` : ""}</td><td style="${cell}text-align:right;font-weight:600;">${escapeHtml(formatFiat(it.quantity * it.unitPrice, inv.currency))}</td></tr>`,
  )
  .join("\n")}
</table>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#ffffff;color:#000000;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:480px;margin:0 auto;">
${emailBannerHtml()}
<p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#666666;">NimBill · Payment Receipt</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${escapeHtml(intro)}</h1>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-top:1px solid #000000;">
${rows
  .map(
    ([k, v]) =>
      `<tr><td style="${cell}color:#666666;white-space:nowrap;padding-right:12px;">${escapeHtml(k)}</td><td style="${cell}text-align:right;font-weight:600;word-break:break-all;">${escapeHtml(v)}</td></tr>`,
  )
  .join("\n")}
</table>
${itemsHtml}
<p style="margin:24px 0 12px;">
  <a href="${escapeHtml(pdfUrl)}" style="display:inline-block;padding:14px 24px;background:#000000;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;margin-right:8px;">Download receipt (PDF)</a>
  <a href="${escapeHtml(receiptUrl)}" style="display:inline-block;padding:13px 20px;background:#ffffff;color:#000000;border:1px solid #000000;font-size:15px;font-weight:600;text-decoration:none;">View receipt</a>
</p>
<p style="margin:0 0 16px;font-size:14px;color:#000000;">${escapeHtml(outro)}</p>
<p style="margin:0;font-size:12px;color:#666666;">${escapeHtml(why)}</p>
</div>
</body>
</html>`;

  const pdfBuffer = buildReceiptPdf(inv);
  return {
    subject,
    text,
    html,
    attachments: [
      {
        filename: `NimBill-Receipt-${inv.number}.pdf`,
        content: pdfBuffer.toString("base64"),
        contentType: "application/pdf",
      },
    ],
  };
}

const INTERVAL_NOUN: Record<RecurringInterval, string> = {
  weekly: "weekly",
  biweekly: "bi-weekly",
  monthly: "monthly",
  quarterly: "quarterly",
  yearly: "yearly",
};

/**
 * Send recurring invoice notifications when a cycle's invoice is issued:
 * 1. To the client (`inv.clientEmail`, if provided) with the payment link and Nimbill number.
 * 2. To the merchant (`merchants.email`, if saved in Settings and `notifyMerchant` is true) so they
 *    can also share the invoice via WhatsApp or link.
 */
export function notifyRecurringInvoiceIssued(
  inv: Invoice,
  rec: Pick<RecurringInvoice, "id" | "interval" | "nextRunDate">,
  options?: { notifyMerchant?: boolean },
): void {
  if (!mail.configured || inv.isDemo) return;
  const notifyMerchant = options?.notifyMerchant ?? true;
  const task = async () => {
    if (inv.clientEmail) {
      try {
        await mail.send({
          to: inv.clientEmail,
          ...recurringClientEmail(inv, rec),
          idempotencyKey: `recurring-client/${inv.id}`,
        });
        logger.info("recurring client email sent", { invoiceId: inv.id, recurringId: rec.id });
      } catch (e) {
        const err = e as Error;
        logger.warn("recurring client email failed", {
          invoiceId: inv.id,
          recurringId: rec.id,
          error: err.message,
          ...(AppError.is(err) ? { code: err.code, details: err.details } : {}),
        });
      }
    }
    if (notifyMerchant) {
      try {
        const db = await getDb();
        const [merchant] = await db
          .select({ email: schema.merchants.email })
          .from(schema.merchants)
          .where(eq(schema.merchants.address, inv.merchantAddress));
        if (merchant?.email) {
          await mail.send({
            to: merchant.email,
            ...recurringMerchantEmail(inv, rec),
            idempotencyKey: `recurring-merchant/${inv.id}`,
          });
          logger.info("recurring merchant email sent", { invoiceId: inv.id, recurringId: rec.id });
        }
      } catch (e) {
        const err = e as Error;
        logger.warn("recurring merchant email failed", {
          invoiceId: inv.id,
          recurringId: rec.id,
          error: err.message,
          ...(AppError.is(err) ? { code: err.code, details: err.details } : {}),
        });
      }
    }
  };
  try {
    after(task);
  } catch {
    void task();
  }
}

/** Email sent to the client when a recurring invoice is generated. */
export function recurringClientEmail(
  inv: Invoice,
  rec: Pick<RecurringInvoice, "id" | "interval">,
): Omit<MailMessage, "to"> {
  const merchant = oneLine(inv.merchantName);
  const client = oneLine(inv.clientName);
  const amount = formatFiat(inv.total, inv.currency);
  const cadence = INTERVAL_NOUN[rec.interval] ?? rec.interval;
  const url = new URL(`/i/${inv.id}`, siteUrl()).toString();
  const unsubUrl = new URL(recurringUnsubscribePath(rec.id), siteUrl()).toString();
  const nbNumber = nimbillNumber(inv.id);
  const assets = inv.merchantEvmAddress ? "NIM or USDT" : "NIM";

  const rows: [string, string][] = [
    ["Invoice", inv.number],
    ["Nimbill number", nbNumber],
    ["From", merchant],
    ["Amount", amount],
    ["Schedule", cadence.charAt(0).toUpperCase() + cadence.slice(1)],
  ];
  if (inv.dueDate) rows.push(["Due date", inv.dueDate]);

  const subject = `Invoice ${inv.number} from ${merchant} (${amount})`;
  const intro = `Hi ${client}, here is your ${cadence} invoice ${inv.number} from ${merchant}.`;
  const outro = `You can pay ${amount} in ${assets} at the live rate using the link above, or by entering Nimbill number ${nbNumber} in Nimiq Pay.`;
  const unsubText = `Don't want to receive future ${cadence} invoices from ${merchant}? Unsubscribe here: ${unsubUrl}`;

  const text = [intro, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `Pay invoice: ${url}`, "", outro, "", unsubText].join("\n");

  const cell = "padding:10px 0;border-bottom:1px solid #e5e5e5;font-size:15px;";
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#ffffff;color:#000000;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:480px;margin:0 auto;">
${emailBannerHtml()}
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
<p style="margin:24px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 24px;background:#000000;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">View &amp; pay invoice</a></p>
<p style="margin:0 0 16px;font-size:14px;color:#000000;">${escapeHtml(outro)}</p>
<p style="margin:0;padding-top:16px;border-top:1px solid #e5e5e5;font-size:12px;color:#666666;">Don&rsquo;t want future ${escapeHtml(cadence)} invoices from ${escapeHtml(merchant)}? <a href="${escapeHtml(unsubUrl)}" style="color:#000000;text-decoration:underline;">Unsubscribe from this recurring invoice</a>.</p>
</div>
</body>
</html>`;

  return { subject, text, html };
}

/** Email sent to the merchant when a scheduled recurring invoice is generated. */
export function recurringMerchantEmail(
  inv: Invoice,
  rec: Pick<RecurringInvoice, "interval" | "nextRunDate">,
): Omit<MailMessage, "to"> {
  const client = oneLine(inv.clientName);
  const amount = formatFiat(inv.total, inv.currency);
  const cadence = INTERVAL_NOUN[rec.interval] ?? rec.interval;
  const url = new URL(`/i/${inv.id}`, siteUrl()).toString();

  const rows: [string, string][] = [
    ["Invoice", inv.number],
    ["Client", client],
    ["Amount", amount],
    ["Schedule", cadence.charAt(0).toUpperCase() + cadence.slice(1)],
    ["Next invoice", rec.nextRunDate],
  ];
  if (inv.dueDate) rows.push(["Due date", inv.dueDate]);

  const subject = `${inv.number} created for ${client} (${amount})`;
  const intro = `Your ${cadence} invoice ${inv.number} for ${client} is ready.`;
  const deliveryNote = inv.clientEmail
    ? `A copy was also emailed to ${inv.clientEmail}. You can still share the payment link directly on WhatsApp or in person.`
    : `Open the invoice to share the payment link or Nimbill number with ${client}.`;
  const why = "You get this email because your address is saved in NimBill Settings. Remove it there to stop these emails.";

  const text = [intro, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `Open invoice: ${url}`, "", deliveryNote, "", why].join("\n");

  const cell = "padding:10px 0;border-bottom:1px solid #e5e5e5;font-size:15px;";
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#ffffff;color:#000000;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:480px;margin:0 auto;">
${emailBannerHtml()}
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
<p style="margin:24px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 24px;background:#000000;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">Open invoice</a></p>
<p style="margin:0 0 16px;font-size:14px;color:#000000;">${escapeHtml(deliveryNote)}</p>
<p style="margin:0;font-size:12px;color:#666666;">${escapeHtml(why)}</p>
</div>
</body>
</html>`;

  return { subject, text, html };
}

/**
 * Tell the merchant when a client unsubscribes from a recurring invoice schedule.
 */
export function notifyRecurringUnsubscribed(rec: RecurringInvoice): void {
  if (!mail.configured) return;
  const task = async () => {
    try {
      const db = await getDb();
      const [merchant] = await db
        .select({ email: schema.merchants.email })
        .from(schema.merchants)
        .where(eq(schema.merchants.address, rec.merchantAddress));
      if (!merchant?.email) return;
      await mail.send({
        to: merchant.email,
        ...recurringUnsubscribedEmail(rec),
        idempotencyKey: `recurring-unsubscribed/${rec.id}`,
      });
      logger.info("recurring unsubscribed email sent", { recurringId: rec.id });
    } catch (e) {
      const err = e as Error;
      logger.warn("recurring unsubscribed email failed", {
        recurringId: rec.id,
        error: err.message,
        ...(AppError.is(err) ? { code: err.code, details: err.details } : {}),
      });
    }
  };
  try {
    after(task);
  } catch {
    void task();
  }
}

export function recurringUnsubscribedEmail(
  rec: Pick<RecurringInvoice, "clientName" | "clientEmail" | "total" | "currency" | "interval">,
): Omit<MailMessage, "to"> {
  const client = oneLine(rec.clientName);
  const amount = formatFiat(rec.total, rec.currency);
  const cadence = INTERVAL_NOUN[rec.interval] ?? rec.interval;
  const url = new URL("/invoices?view=recurring", siteUrl()).toString();

  const rows: [string, string][] = [
    ["Client", client],
    ...(rec.clientEmail ? ([["Client email", rec.clientEmail]] as [string, string][]) : []),
    ["Amount", amount],
    ["Schedule", `${cadence.charAt(0).toUpperCase() + cadence.slice(1)} (stopped by client)`],
  ];

  const subject = `${client} unsubscribed from your ${cadence} invoice (${amount})`;
  const intro = `${client} opted out of future ${cadence} invoices.`;
  const outro = "Any invoices already sent stay open as they are, and no new recurring invoices will be generated for this schedule.";
  const why = "You get this email because your address is saved in NimBill Settings. Remove it there to stop these emails.";

  const text = [intro, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `View recurring invoices: ${url}`, "", outro, "", why].join("\n");

  const cell = "padding:10px 0;border-bottom:1px solid #e5e5e5;font-size:15px;";
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#ffffff;color:#000000;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:480px;margin:0 auto;">
${emailBannerHtml()}
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
<p style="margin:24px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 24px;background:#000000;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">View recurring schedules</a></p>
<p style="margin:0 0 16px;font-size:14px;color:#000000;">${escapeHtml(outro)}</p>
<p style="margin:0;font-size:12px;color:#666666;">${escapeHtml(why)}</p>
</div>
</body>
</html>`;

  return { subject, text, html };
}
