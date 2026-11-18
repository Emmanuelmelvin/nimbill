// Unit & integration checks for recurring invoices (date math, schedule lifecycle, unsubscribe, email templates).
// Run: npm run test:recurring
import { addDaysToDate, addInterval, recurringUnsubscribeToken, verifyUnsubscribeToken } from "../src/lib/recurring.ts";
import {
  paidEmail,
  payerReceiptEmail,
  recurringClientEmail,
  recurringMerchantEmail,
  recurringUnsubscribedEmail,
} from "../src/lib/notifications.ts";
import { buildReceiptPdf } from "../src/lib/receipt-pdf.ts";
import { BoardInvoiceBody, NewInvoiceBody, QuoteBody, ReceiptEmailBody, VerifyBody } from "../src/lib/schemas.ts";
import type { Invoice } from "../src/lib/db/schema.ts";

let failed = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) failed++;
};

// 1. Date arithmetic & month-end clamping
ok(addDaysToDate("2026-11-18", 0) === "2026-11-18", "addDaysToDate: 0 days");
ok(addDaysToDate("2026-11-18", 7) === "2026-11-25", "addDaysToDate: +7 days");
ok(addDaysToDate("2026-11-25", 14) === "2026-12-09", "addDaysToDate: crosses month boundary");

ok(addInterval("2026-11-18", "weekly") === "2026-11-25", "addInterval: weekly");
ok(addInterval("2026-11-18", "biweekly") === "2026-12-02", "addInterval: biweekly");
ok(addInterval("2026-11-18", "monthly") === "2026-12-18", "addInterval: monthly");
ok(addInterval("2026-01-31", "monthly") === "2026-02-28", "addInterval: clamps Jan 31 -> Feb 28 (non-leap)");
ok(addInterval("2028-01-31", "monthly") === "2028-02-29", "addInterval: clamps Jan 31 -> Feb 29 (leap year)");
ok(addInterval("2026-11-30", "quarterly") === "2027-02-28", "addInterval: quarterly clamps Nov 30 -> Feb 28");
ok(addInterval("2026-11-18", "yearly") === "2027-11-18", "addInterval: yearly");
ok(addInterval("2028-02-29", "yearly") === "2029-02-28", "addInterval: yearly clamps Feb 29 -> Feb 28");

// 2. Email templates
const sampleInvoice: Invoice = {
  id: "abc2345678",
  number: "INV-0042",
  merchantAddress: "NQ07 0000 0000 0000 0000 0000 0000 0000 0000",
  merchantName: "Studio Kibo",
  merchantEvmAddress: "0x1111111111111111111111111111111111111111",
  clientName: "Acme Corp",
  clientEmail: "billing@acme.example",
  payerEmail: "payer@acme.example",
  items: [{ description: "Monthly design retainer", quantity: 1, unitPrice: 500 }],
  currency: "USD",
  total: "500.00",
  note: "Thank you!",
  dueDate: "2026-11-25",
  status: "unpaid",
  isDemo: false,
  source: "direct",
  productId: null,
  createdAt: new Date("2026-11-18T12:00:00Z"),
  paidAsset: null,
  paidAmount: null,
  paidRate: null,
  paidTxHash: null,
  paidFrom: null,
  paidAt: null,
  paidUsd: null,
  paidTip: null,
  viewedAt: null,
  integrationId: null,
  reference: null,
  metadata: null,
  returnUrl: null,
  recurringId: "rec_23456789ab",
};

const clientMail = recurringClientEmail(sampleInvoice, { id: "rec_23456789ab", interval: "monthly" });
ok(clientMail.subject === "Invoice INV-0042 from Studio Kibo ($500.00)", `client email subject: ${clientMail.subject}`);
ok(clientMail.text.includes("/i/abc2345678") && clientMail.text.includes("NIM or USDT"), "client email includes link and accepted coins");
ok(clientMail.html.includes("View &amp; pay invoice"), "client email HTML has CTA button");
ok(
  clientMail.text.includes("/r/rec_23456789ab/unsubscribe?token=") &&
    clientMail.html.includes("Unsubscribe from this recurring invoice"),
  "client email includes signed unsubscribe link in text and HTML",
);

const merchantMail = recurringMerchantEmail(sampleInvoice, { interval: "monthly", nextRunDate: "2026-12-18" });
ok(merchantMail.subject === "INV-0042 created for Acme Corp ($500.00)", `merchant email subject: ${merchantMail.subject}`);
ok(
  merchantMail.text.includes("billing@acme.example") && merchantMail.text.includes("2026-12-18"),
  "merchant email notes client email delivery and next run date",
);

const unsubMail = recurringUnsubscribedEmail({
  clientName: "Acme Corp",
  clientEmail: "billing@acme.example",
  total: "500.00",
  currency: "USD",
  interval: "monthly",
});
ok(unsubMail.subject === "Acme Corp unsubscribed from your monthly invoice ($500.00)", `unsub email subject: ${unsubMail.subject}`);

// 3. Unsubscribe token & schema validation
const tok = recurringUnsubscribeToken("rec_23456789ab");
ok(tok.length === 32 && verifyUnsubscribeToken("rec_23456789ab", tok), "valid unsubscribe token verifies");
ok(!verifyUnsubscribeToken("rec_23456789ab", "0".repeat(32)), "tampered unsubscribe token rejected");
ok(!verifyUnsubscribeToken("rec_other", tok), "token for another schedule rejected");

const missingEmail = NewInvoiceBody.safeParse({
  clientName: "Acme Corp",
  clientEmail: "",
  currency: "USD",
  items: [{ description: "Retainer", quantity: 1, unitPrice: 100 }],
  recurring: { interval: "monthly", dueDays: 7 },
});
ok(!missingEmail.success, "recurring invoice requires clientEmail");

const withEmail = NewInvoiceBody.safeParse({
  clientName: "Acme Corp",
  clientEmail: "billing@acme.example",
  currency: "USD",
  items: [{ description: "Retainer", quantity: 1, unitPrice: 100 }],
  recurring: { interval: "monthly", dueDays: 7 },
});
ok(withEmail.success, "recurring invoice with clientEmail passes validation");

// 4. Email banner & payer receipt email + PDF generation
const paidSample: Invoice = {
  ...sampleInvoice,
  status: "paid",
  paidAsset: "NIM",
  paidAmount: "156810000",
  paidRate: "0.318857",
  paidTxHash: "8f3c".repeat(16),
  paidFrom: "NQ16 ADMA EM3A 32VA BTBJ SA58 B0FV 909J FQE4",
  paidAt: new Date("2026-11-18T13:00:00Z"),
  paidUsd: "525.000000",
  paidTip: "25.00",
};

const merchantPaidMail = paidEmail(paidSample);
const payerPaidMail = payerReceiptEmail(paidSample);
for (const [label, msg] of [
  ["paidEmail", merchantPaidMail],
  ["payerReceiptEmail", payerPaidMail],
  ["recurringClientEmail", clientMail],
  ["recurringMerchantEmail", merchantMail],
  ["recurringUnsubscribedEmail", unsubMail],
] as const) {
  ok(msg.html?.includes("/email-banner.png") ?? false, `${label} includes top README banner image (/email-banner.png)`);
}

ok(
  payerPaidMail.subject === "Receipt for INV-0042: $525.00 paid to Studio Kibo",
  `payer receipt email subject: ${payerPaidMail.subject}`,
);
ok(
  payerPaidMail.text.includes("/api/invoices/abc2345678/receipt") &&
    (payerPaidMail.html?.includes("Download receipt (PDF)") ?? false),
  "payer receipt email includes PDF receipt download link and button",
);
ok(
  payerPaidMail.attachments?.length === 1 &&
    payerPaidMail.attachments[0].filename === "NimBill-Receipt-INV-0042.pdf" &&
    payerPaidMail.attachments[0].contentType === "application/pdf",
  "payer receipt email attaches NimBill-Receipt-INV-0042.pdf",
);

const pdfBuf = buildReceiptPdf(paidSample);
const pdfStr = pdfBuf.toString("latin1");
ok(
  pdfStr.startsWith("%PDF-1.4") &&
    pdfStr.includes("ON-CHAIN PAYMENT RECEIPT") &&
    pdfStr.includes("INV-0042") &&
    pdfStr.includes("Studio Kibo") &&
    pdfStr.includes("Acme Corp") &&
    pdfStr.includes("%%EOF"),
  `buildReceiptPdf generates a valid PDF 1.4 document (${pdfBuf.length} bytes)`,
);

ok(QuoteBody.safeParse({ asset: "NIM", tip: 5, payerEmail: "payer@acme.example" }).success, "QuoteBody accepts optional payerEmail");
ok(!QuoteBody.safeParse({ asset: "NIM", payerEmail: "not-an-email" }).success, "QuoteBody rejects invalid payerEmail");
ok(
  VerifyBody.safeParse({ asset: "NIM", txHash: "ab".repeat(32), payerEmail: "payer@acme.example" }).success,
  "VerifyBody accepts optional payerEmail",
);
ok(
  BoardInvoiceBody.safeParse({ productId: "p1", payerName: "Tunde", payerEmail: "tunde@example.com" }).success,
  "BoardInvoiceBody accepts optional payerEmail",
);
ok(ReceiptEmailBody.safeParse({ email: "tunde@example.com" }).success, "ReceiptEmailBody validates email");

process.exit(failed ? 1 : 0);
