"use client";
import { CurrencyIcon } from "@/components/CurrencyIcon";
import { Dropdown } from "@/components/ui";
import { CURRENCIES } from "@/lib/currencies";

const OPTIONS = CURRENCIES.map((c) => ({
  value: c.code as string,
  label: c.code,
  detail: c.name,
  icon: <CurrencyIcon code={c.code} />,
}));

const COIN_OPTIONS = [
  { value: "NIM", label: "NIM", detail: "Nimiq", icon: <CurrencyIcon code="NIM" /> },
  { value: "USDT", label: "USDT", detail: "Tether", icon: <CurrencyIcon code="USDT" /> },
];
const WITH_COINS = [...OPTIONS, ...COIN_OPTIONS];

const WITH_NIM = [...OPTIONS, COIN_OPTIONS[0]];
const WITH_USDT = [...OPTIONS, COIN_OPTIONS[1]];

/**
 * Currency picker: flag, code and name for each currency an invoice can be priced in.
 * `coins` adds NIM and USDT (for goals, which can be set in either); "NIM" or "USDT" adds only
 * that coin (for sending, where the amount is typed in a currency or in the coin being sent).
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
  coins?: boolean | "NIM" | "USDT";
  placeholder?: string;
}) {
  const options = coins === "NIM" ? WITH_NIM : coins === "USDT" ? WITH_USDT : coins ? WITH_COINS : OPTIONS;
  return <Dropdown id={id} options={options} value={value} onChange={onChange} placeholder={placeholder} />;
}
