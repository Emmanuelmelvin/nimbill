"use client";
import { AR, AU, BR, CA, CH, CM, CR, EU, GB, GH, ID, IN, KE, MX, NG, PH, TR, US, ZA } from "country-flag-icons/react/3x2";
import { Dropdown } from "@/components/ui";
import { CURRENCIES } from "@/lib/currencies";

// SVG flags rather than emoji: Windows has no flag emoji, it shows "US" as two letters.
const FLAGS = { AR, AU, BR, CA, CH, CM, CR, EU, GB, GH, ID, IN, KE, MX, NG, PH, TR, US, ZA };

const OPTIONS = CURRENCIES.map((c) => {
  const Flag = FLAGS[c.flag];
  return {
    value: c.code as string,
    label: c.code,
    detail: c.name,
    // The hairline keeps white flag edges visible on the white page.
    icon: <Flag aria-hidden className="h-4 w-6 shrink-0 outline outline-1 outline-line" />,
  };
});

const coinIcon = (letter: string) => (
  <span aria-hidden className="flex h-4 w-6 shrink-0 items-center justify-center bg-ink font-mono text-[10px] font-bold text-paper">
    {letter}
  </span>
);
const COIN_OPTIONS = [
  { value: "NIM", label: "NIM", detail: "Nimiq", icon: coinIcon("N") },
  { value: "USDT", label: "USDT", detail: "Tether", icon: coinIcon("T") },
];
const WITH_COINS = [...OPTIONS, ...COIN_OPTIONS];

/**
 * Currency picker: flag, code and name for each currency an invoice can be priced in.
 * `coins` adds NIM and USDT (for goals, which can be set in either).
 */
export function CurrencySelect({
  id,
  value,
  onChange,
  coins,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (code: string) => void;
  coins?: boolean;
  placeholder?: string;
}) {
  return <Dropdown id={id} options={coins ? WITH_COINS : OPTIONS} value={value} onChange={onChange} placeholder={placeholder} />;
}
