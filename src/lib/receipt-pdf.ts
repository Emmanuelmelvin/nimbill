import { formatAsset } from "./currencies";
import type { Invoice } from "./db/schema";
import { nimbillNumber } from "./nimbill-number";
import { siteUrl } from "./site";

/**
 * Format a fiat amount for standard PDF Type1 fonts (WinAnsiEncoding), falling back to the
 * 3-letter ISO currency code for symbols outside ASCII/Latin-1 (such as ₦, ₵, ₹, ₫, ₱, ₴).
 */
function pdfFiat(amount: number | string, currency: string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
  const asciiSymbols: Record<string, string> = {
    USD: "$",
    GBP: "\xA3",
    JPY: "\xA5",
  };
  const sym = asciiSymbols[currency];
  return sym ? `${sym}${formatted} ${currency}` : `${currency} ${formatted}`;
}

/** Convert arbitrary UTF-8 text into safe PDF WinAnsi literal string contents. */
function pdfEscape(raw: string): string {
  const normalized = raw
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "\xB7");
  let out = "";
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    const ch = normalized[i];
    if (ch === "\\" || ch === "(" || ch === ")") {
      out += "\\" + ch;
    } else if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      out += String.fromCharCode(code);
    } else if (code === 0x09 || code === 0x0a || code === 0x0d) {
      out += " ";
    } else {
      out += "?";
    }
  }
  return out;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}

/**
 * Build a standalone, printable A4 PDF receipt for a paid invoice.
 * Uses built-in PDF 1.4 Type1 fonts (Helvetica, Helvetica-Bold, Courier) so it runs in any
 * serverless or edge environment with zero external dependencies.
 */
export function buildReceiptPdf(inv: Invoice): Buffer {
  const pageWidth = 595.28; // A4 width in pt
  const pageHeight = 841.89; // A4 height in pt
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  const rightEdge = pageWidth - margin;

  const tip = Number(inv.paidTip ?? 0);
  const total = Number(inv.total);
  const paidFiat = total + tip;
  const asset = (inv.paidAsset ?? "NIM") as "NIM" | "USDT";
  const coinPaid = inv.paidAmount ? formatAsset(inv.paidAmount, asset) : asset;
  const rateNum = Number(inv.paidRate ?? 0);
  const rateStr =
    rateNum > 0
      ? `1 ${asset} = ${rateNum < 0.01 ? rateNum.toPrecision(4) : rateNum.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${inv.currency}`
      : "";
  const issuedStr = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(inv.createdAt);
  const paidAtStr = inv.paidAt
    ? `${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(inv.paidAt)} UTC`
    : issuedStr;
  const nbNumber = nimbillNumber(inv.id);
  const invLabel = inv.number === nbNumber ? inv.number : `${inv.number} (${nbNumber})`;
  const receiptUrl = new URL(`/i/${inv.id}/receipt`, siteUrl()).toString();

  const ops: string[] = [];

  const text = (x: number, y: number, str: string, font: "F1" | "F2" | "F3" = "F1", size = 10, colorGray = 0) => {
    ops.push(
      `BT /${font} ${size} Tf ${colorGray.toFixed(2)} g 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfEscape(str)}) Tj ET`,
    );
  };

  // Approximate character widths in Helvetica/Courier to right-align labels cleanly
  const textWidth = (str: string, font: "F1" | "F2" | "F3", size: number) => {
    const factor = font === "F3" ? 0.6 : font === "F2" ? 0.56 : 0.52;
    return str.length * size * factor;
  };

  const textRight = (xRight: number, y: number, str: string, font: "F1" | "F2" | "F3" = "F1", size = 10, colorGray = 0) => {
    const x = xRight - textWidth(str, font, size);
    text(x, y, str, font, size, colorGray);
  };

  const hLine = (y: number, thickness = 0.75, gray = 0.85) => {
    ops.push(`${gray.toFixed(2)} G ${thickness.toFixed(2)} w ${margin} ${y.toFixed(2)} m ${rightEdge.toFixed(2)} ${y.toFixed(2)} l S`);
  };

  let y = pageHeight - margin;

  // Top banner box (NimBill black header bar)
  const headerH = 54;
  ops.push(`0 g ${margin} ${(y - headerH).toFixed(2)} ${contentWidth.toFixed(2)} ${headerH} re f`);
  text(margin + 16, y - 24, "NIMBILL", "F2", 14, 1);
  text(margin + 16, y - 40, "ON-CHAIN PAYMENT RECEIPT", "F3", 8.5, 0.78);

  // "PAID" badge inside the header bar
  const badgeW = 54;
  const badgeH = 22;
  const badgeX = rightEdge - 16 - badgeW;
  const badgeY = y - 38;
  ops.push(`1 g ${badgeX.toFixed(2)} ${badgeY.toFixed(2)} ${badgeW} ${badgeH} re f`);
  text(badgeX + 13, badgeY + 7, "PAID", "F2", 10, 0);

  y -= headerH + 28;

  // Amount paid & invoice number
  text(margin, y, "AMOUNT PAID", "F3", 8.5, 0.4);
  textRight(rightEdge, y, `INVOICE ${invLabel}`, "F3", 8.5, 0.4);
  y -= 24;
  text(margin, y, pdfFiat(paidFiat, inv.currency), "F2", 22, 0);
  textRight(rightEdge, y + 4, coinPaid, "F2", 13, 0.2);
  y -= 16;
  if (tip > 0) {
    text(margin, y, `Includes a ${pdfFiat(tip, inv.currency)} tip`, "F1", 9.5, 0.4);
    y -= 14;
  }

  y -= 6;
  hLine(y, 1, 0);
  y -= 20;

  // Two-column From / Billed To + Dates
  const col2X = margin + contentWidth * 0.52;
  text(margin, y, "FROM", "F3", 8, 0.45);
  text(col2X, y, "BILLED TO", "F3", 8, 0.45);
  y -= 14;
  text(margin, y, truncate(inv.merchantName, 40), "F2", 11, 0);
  text(col2X, y, truncate(inv.clientName, 40), "F2", 11, 0);
  y -= 13;
  const merchantWallet = asset === "USDT" && inv.merchantEvmAddress ? inv.merchantEvmAddress : inv.merchantAddress;
  text(margin, y, truncate(merchantWallet, 48), "F3", 7.5, 0.4);
  const recipientEmail = inv.payerEmail || inv.clientEmail;
  if (recipientEmail) {
    text(col2X, y, truncate(recipientEmail, 44), "F1", 9, 0.4);
  }
  y -= 18;
  text(margin, y, `Issued: ${issuedStr}`, "F1", 9, 0.35);
  text(col2X, y, `Paid: ${paidAtStr}`, "F1", 9, 0.35);

  y -= 14;
  hLine(y, 0.75, 0.82);
  y -= 18;

  // Line items table
  text(margin, y, "ITEM", "F3", 8.5, 0.4);
  textRight(rightEdge, y, "AMOUNT", "F3", 8.5, 0.4);
  y -= 8;
  hLine(y, 0.75, 0);
  y -= 16;

  const maxItems = Math.min(inv.items.length, 12);
  for (let i = 0; i < maxItems; i++) {
    const it = inv.items[i];
    const lineTotal = it.quantity * it.unitPrice;
    const desc = it.quantity !== 1 ? `${truncate(it.description, 52)} (${it.quantity} x ${pdfFiat(it.unitPrice, inv.currency)})` : truncate(it.description, 68);
    text(margin, y, desc, "F1", 10, 0);
    textRight(rightEdge, y, pdfFiat(lineTotal, inv.currency), "F1", 10, 0);
    y -= 8;
    hLine(y, 0.5, 0.9);
    y -= 15;
  }
  if (inv.items.length > maxItems) {
    text(margin, y, `+ ${inv.items.length - maxItems} more item(s)`, "F1", 9, 0.45);
    y -= 16;
  }

  // Totals
  text(margin, y, "Subtotal / Invoice Total", "F2", 10, 0);
  textRight(rightEdge, y, pdfFiat(total, inv.currency), "F2", 10, 0);
  y -= 15;

  if (tip > 0) {
    text(margin, y, "Tip", "F1", 10, 0.3);
    textRight(rightEdge, y, pdfFiat(tip, inv.currency), "F1", 10, 0.3);
    y -= 15;
    text(margin, y, "Total Paid", "F2", 11, 0);
    textRight(rightEdge, y, pdfFiat(paidFiat, inv.currency), "F2", 11, 0);
    y -= 16;
  }

  if (inv.note) {
    y -= 4;
    text(margin, y, `Note: ${truncate(inv.note.replace(/\s+/g, " "), 80)}`, "F1", 9, 0.35);
    y -= 16;
  }

  y -= 8;

  // On-chain settlement proof box
  const settlementRows: [string, string, "F1" | "F2" | "F3"][] = [
    ["Settlement Amount", coinPaid, "F2"],
    ...(rateStr ? ([["Exchange Rate", rateStr, "F1"]] as [string, string, "F1"][]) : []),
    ["Network", asset === "NIM" ? "Nimiq Blockchain" : "Polygon (USDT)", "F1"],
    ["Paid To", merchantWallet, "F3"],
    ...(inv.paidFrom ? ([["Paid From", inv.paidFrom, "F3"]] as [string, string, "F3"][]) : []),
    ...(inv.paidTxHash ? ([["Transaction Hash", inv.paidTxHash, "F3"]] as [string, string, "F3"][]) : []),
    ["Verify Receipt", receiptUrl, "F3"],
  ];

  const boxH = 28 + settlementRows.length * 16;
  const boxTop = y;
  const boxBottom = boxTop - boxH;
  ops.push(`0.96 g ${margin} ${boxBottom.toFixed(2)} ${contentWidth.toFixed(2)} ${boxH.toFixed(2)} re f`);
  ops.push(`0 G 0.75 w ${margin} ${boxBottom.toFixed(2)} ${contentWidth.toFixed(2)} ${boxH.toFixed(2)} re s`);

  let sy = boxTop - 16;
  text(margin + 12, sy, "ON-CHAIN SETTLEMENT PROOF", "F3", 8.5, 0.35);
  sy -= 16;

  for (const [label, val, valFont] of settlementRows) {
    text(margin + 12, sy, label, "F1", 9, 0.4);
    const maxLen = valFont === "F3" ? 56 : 52;
    textRight(rightEdge - 12, sy, truncate(val, maxLen), valFont, valFont === "F3" ? 7.5 : 9, 0);
    sy -= 16;
  }

  y = boxBottom - 22;
  text(
    margin,
    y,
    "This receipt is backed by a public blockchain transaction verified on-chain by NimBill.",
    "F1",
    8.5,
    0.45,
  );

  const streamContent = ops.join("\n");
  const streamBytes = Buffer.from(streamContent, "latin1");

  const objects: string[] = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>\nendobj\n`,
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n",
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n",
    "6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>\nendobj\n",
    `7 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
  ];

  const header = "%PDF-1.4\n%\xFF\xFF\xFF\xFF\n";
  const parts: Buffer[] = [Buffer.from(header, "latin1")];
  const offsets: number[] = [];
  let cursor = parts[0].length;

  for (const obj of objects) {
    offsets.push(cursor);
    const buf = Buffer.from(obj, "latin1");
    parts.push(buf);
    cursor += buf.length;
  }

  const xrefOffset = cursor;
  const xrefLines = [
    `xref\n0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.map((off) => `${String(off).padStart(10, "0")} 00000 n `),
  ];
  const trailer = `\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  parts.push(Buffer.from(xrefLines.join("\n") + trailer, "latin1"));

  return Buffer.concat(parts);
}
