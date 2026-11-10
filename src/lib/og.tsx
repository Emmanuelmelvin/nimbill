// Building blocks for generated Open Graph images (rendered by next/og, which supports flexbox only:
// every element with more than one child needs display: flex). Black & white, sharp edges.

export const OG_SIZE = { width: 1200, height: 630 };
export const INK = "#000000";
export const PAPER = "#ffffff";
export const MUTED = "#666666";

/** The NimBill receipt mark, same shape as app/icon.svg. */
export function OgMark({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path d="M5 2H27V26L24.25 30L21.5 26L18.75 30L16 26L13.25 30L10.5 26L7.75 30L5 26Z" fill={INK} />
      <path d="M11 20V9L21 20V9" fill="none" stroke={PAPER} strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

/** White canvas with the logo on top, the given content in the middle and a footer line. */
export function OgFrame({ children, footerLeft, footerRight }: { children: React.ReactNode; footerLeft: string; footerRight: string }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: PAPER, color: INK, padding: 72 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <OgMark size={64} />
        <div style={{ fontSize: 44, letterSpacing: -1.5 }}>NimBill</div>
      </div>
      {children}
      <div style={{ display: "flex", justifyContent: "space-between", borderTop: `2px solid ${INK}`, paddingTop: 28, fontSize: 26 }}>
        <div style={{ display: "flex" }}>{footerLeft}</div>
        <div style={{ display: "flex", color: MUTED }}>{footerRight}</div>
      </div>
    </div>
  );
}
