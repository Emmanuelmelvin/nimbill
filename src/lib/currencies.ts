// Fiat currencies an invoice can be priced in. All are supported by CoinGecko.
export const CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦" },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh" },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "GH₵" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "XAF", name: "Central African CFA", symbol: "FCFA" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "PHP", name: "Philippine Peso", symbol: "₱" },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$" },
  { code: "ARS", name: "Argentine Peso", symbol: "AR$" },
  { code: "TRY", name: "Turkish Lira", symbol: "₺" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "CAD", name: "Canadian Dollar", symbol: "CA$" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "CRC", name: "Costa Rican Colón", symbol: "₡" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];
export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as unknown as [CurrencyCode, ...CurrencyCode[]];

export function formatFiat(amount: number | string, currency: string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  try {
    // narrowSymbol: "₦85,000.00" instead of "NGN 85,000.00"; keep code for ambiguous "$" currencies.
    const ambiguous = ["CAD", "AUD", "MXN", "ARS"].includes(currency);
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      currencyDisplay: ambiguous ? "symbol" : "narrowSymbol",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export const LUNA_PER_NIM = 100_000;
export const USDT_DECIMALS = 6;

export function formatAsset(units: string | number | bigint, asset: "NIM" | "USDT"): string {
  const n = Number(units) / (asset === "NIM" ? LUNA_PER_NIM : 10 ** USDT_DECIMALS);
  // USDT shows all 6 decimals when present: each USDT price carries a unique sub-cent tag
  // (see uniqueUsdtAmount), so the payer must see exactly what will be charged.
  const fmt = asset === "USDT" ? { minimumFractionDigits: 2, maximumFractionDigits: 6 } : { minimumFractionDigits: 0, maximumFractionDigits: 2 };
  return `${new Intl.NumberFormat("en", fmt).format(n)} ${asset}`;
}
