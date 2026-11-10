import { ImageResponse } from "next/og";
import { formatFiat } from "@/lib/currencies";
import { getInvoice } from "@/lib/invoices";
import { INK, MUTED, OG_SIZE, OgFrame, PAPER } from "@/lib/og";

// Share image for an invoice link (WhatsApp, Telegram, X…): number, amount, sender and status.
// Only details the public invoice page already shows; the client's name and email are left out.
export const alt = "NimBill invoice";
export const size = OG_SIZE;
export const contentType = "image/png";

const STATUS: Record<string, string> = { paid: "PAID", unpaid: "AWAITING PAYMENT", cancelled: "CANCELLED" };

/** "NGN 65,000.00": the image font has no glyphs for symbols like ₦ or ₵, so use the currency code. */
function amountWithCode(total: string | number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code" }).format(Number(total)).replace(/ /g, " ");
  } catch {
    return `${currency} ${formatFiat(total, currency)}`;
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await getInvoice(id).catch(() => null);

  if (!inv) {
    return new ImageResponse(
      (
        <OgFrame footerLeft="Check the link and try again" footerRight="A Nimiq Pay Mini App">
          <div style={{ display: "flex", fontSize: 84, letterSpacing: -3.5 }}>Invoice not found</div>
        </OgFrame>
      ),
      size,
    );
  }

  const paid = inv.status === "paid";
  const payWith = `Pay with NIM${inv.merchantEvmAddress ? " or USDT" : ""} in Nimiq Pay`;
  return new ImageResponse(
    (
      <OgFrame footerLeft={paid ? "Paid · Verified on the blockchain" : payWith} footerRight="A Nimiq Pay Mini App">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ display: "flex", fontSize: 30, letterSpacing: 3, color: MUTED }}>INVOICE {inv.number}</div>
            <div
              style={{
                display: "flex",
                fontSize: 22,
                letterSpacing: 2,
                padding: "6px 14px",
                border: `2px solid ${INK}`,
                background: paid ? INK : PAPER,
                color: paid ? PAPER : INK,
              }}
            >
              {STATUS[inv.status] ?? "INVOICE"}
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 120, lineHeight: 1, letterSpacing: -5 }}>{amountWithCode(inv.total, inv.currency)}</div>
          <div style={{ display: "flex", fontSize: 40, color: MUTED }}>from {inv.merchantName}</div>
        </div>
      </OgFrame>
    ),
    size,
  );
}
