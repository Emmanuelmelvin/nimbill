import { ImageResponse } from "next/og";
import { MUTED, OG_SIZE, OgFrame } from "@/lib/og";

// Default share image for every page that doesn't have its own (invoices do).
export const alt = "NimBill: invoice in your currency, get paid in NIM or USDT";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <OgFrame footerLeft="Verified on-chain · Wallet to wallet" footerRight="A Nimiq Pay Mini App">
        <div style={{ display: "flex", flexDirection: "column", fontSize: 84, lineHeight: 1.05, letterSpacing: -3.5 }}>
          <div style={{ display: "flex" }}>Invoice in your currency.</div>
          <div style={{ display: "flex", color: MUTED }}>Get paid in NIM or USDT.</div>
        </div>
      </OgFrame>
    ),
    size,
  );
}
