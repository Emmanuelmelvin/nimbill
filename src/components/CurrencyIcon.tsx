import { AR, AU, BR, CA, CH, CM, CR, EU, GB, GH, ID, IN, KE, MX, NG, PH, TR, US, ZA } from "country-flag-icons/react/3x2";
import type { ReactNode } from "react";
import { CoinIcon } from "./CoinIcon";
import { cx } from "./ui";
import { CURRENCIES } from "@/lib/currencies";

// SVG flags rather than emoji: Windows has no flag emoji, it shows "US" as two letters.
const FLAGS = { AR, AU, BR, CA, CH, CM, CR, EU, GB, GH, ID, IN, KE, MX, NG, PH, TR, US, ZA };
const FLAG_OF = new Map<string, keyof typeof FLAGS>(CURRENCIES.map((c) => [c.code, c.flag]));

/**
 * The icon for any currency NimBill shows: the country's flag for a fiat code (NGN → 🇳🇬), or the
 * coin's logo for NIM and USDT. Sized like a flag (a 3:2 box) unless `className` gives a size.
 * Renders nothing for a code it doesn't know.
 */
export function CurrencyIcon({ code, className }: { code: string; className?: string }) {
  if (code === "NIM" || code === "USDT") return <CoinIcon coin={code} className={className} />;
  const flag = FLAG_OF.get(code);
  if (!flag) return null;
  const Flag = FLAGS[flag];
  // The hairline keeps white flag edges visible on the white page.
  return <Flag aria-hidden className={cx("shrink-0 outline outline-1 outline-line", className ?? "h-4 w-6")} />;
}

/** A currency's icon followed by its code (or `children`), for toggles, labels and running text. */
export function CurrencyLabel({ code, children, className }: { code: string; children?: ReactNode; className?: string }) {
  const coin = code === "NIM" || code === "USDT";
  return (
    <span className={cx("inline-flex items-center gap-1.5 align-middle whitespace-nowrap", className)}>
      {/* Coin logos are round or hexagonal, so they get a square box; flags keep their 3:2 shape. */}
      <CurrencyIcon code={code} className={coin ? "h-4 w-4" : "h-3 w-[18px]"} />
      {children ?? code}
    </span>
  );
}
