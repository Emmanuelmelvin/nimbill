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

/** Currency picker: flag, code and name for each currency an invoice can be priced in. */
export function CurrencySelect({ id, value, onChange }: { id?: string; value: string; onChange: (code: string) => void }) {
  return <Dropdown id={id} options={OPTIONS} value={value} onChange={onChange} />;
}
