import { ImageResponse } from "next/og";
import { MUTED, OG_SIZE, OgFrame } from "./og";

/** Share image for a marketing page or blog post: a small label over a large title. */
export function pageOgImage({
  label,
  title,
  footerLeft = "Verified on-chain · Wallet to wallet",
}: {
  label: string;
  title: string;
  footerLeft?: string;
}) {
  return new ImageResponse(
    <OgFrame footerLeft={footerLeft} footerRight="A Nimiq Pay Mini App">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", fontSize: 26, letterSpacing: 3, textTransform: "uppercase", color: MUTED }}>{label}</div>
        <div style={{ display: "flex", fontSize: title.length > 40 ? 68 : 84, lineHeight: 1.05, letterSpacing: -3 }}>{title}</div>
      </div>
    </OgFrame>,
    OG_SIZE,
  );
}
