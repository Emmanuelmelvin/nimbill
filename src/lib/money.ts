// Showing one amount in whatever unit the merchant prefers. Works on the server and in the browser.
//
// Earnings are stored as a US-dollar value taken when each payment was verified (invoices.paid_usd),
// because invoices in different currencies can't be added up otherwise. To display a total we
// convert that dollar value to NIM, USDT or a fiat currency at today's rate.
import { CURRENCY_CODES, formatFiat } from "./currencies";

/** The dollar price of each coin, and how much of each fiat one dollar buys. */
export type Fx = { nimUsd: number; usdtUsd: number; perUsd: Record<string, number> };

/** "NIM", "USDT" or a fiat currency code. */
export type Unit = string;

export const COIN_UNITS = ["NIM", "USDT"] as const;
export const UNIT_CODES = [...CURRENCY_CODES, ...COIN_UNITS] as [string, ...string[]];

/** A dollar value in `unit`, or null when we have no rate for it. */
export function fromUsd(usd: number, unit: Unit, fx: Fx | null): number | null {
  if (unit === "USD") return usd;
  if (!fx) return null;
  if (unit === "NIM") return usd / fx.nimUsd;
  if (unit === "USDT") return usd / fx.usdtUsd;
  const rate = fx.perUsd[unit];
  return rate > 0 ? usd * rate : null;
}

/** An amount in `unit` as dollars, or null when we have no rate for it. */
export function toUsd(amount: number, unit: Unit, fx: Fx | null): number | null {
  if (unit === "USD") return amount;
  if (!fx) return null;
  if (unit === "NIM") return amount * fx.nimUsd;
  if (unit === "USDT") return amount * fx.usdtUsd;
  const rate = fx.perUsd[unit];
  return rate > 0 ? amount / rate : null;
}

export type MoneyFormat = {
  /** "₦1.3M": for tight spots like chart labels. */
  compact?: boolean;
  /** No decimals: for summary tiles, where a long figure would wrap mid-number. */
  whole?: boolean;
};

/** An amount that is already in `unit`: "₦85,000.00", "1,250 NIM", "40.00 USDT". */
export function formatUnit(amount: number, unit: Unit, opts: MoneyFormat = {}): string {
  if (unit === "NIM" || unit === "USDT") {
    const digits = opts.whole ? 0 : unit === "USDT" ? 2 : amount >= 100 ? 0 : 2;
    const n = new Intl.NumberFormat("en", {
      notation: opts.compact ? "compact" : "standard",
      minimumFractionDigits: opts.compact || opts.whole ? 0 : unit === "USDT" ? 2 : 0,
      maximumFractionDigits: opts.compact ? 1 : digits,
    }).format(amount);
    return `${n} ${unit}`;
  }
  if (opts.compact) {
    try {
      return new Intl.NumberFormat("en", {
        style: "currency",
        currency: unit,
        currencyDisplay: "narrowSymbol",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(amount);
    } catch {
      // fall through to the plain format
    }
  }
  if (opts.whole) {
    try {
      return new Intl.NumberFormat("en", {
        style: "currency",
        currency: unit,
        currencyDisplay: "narrowSymbol",
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      // fall through to the plain format
    }
  }
  return formatFiat(amount, unit);
}

/** A dollar value shown in `unit`. Falls back to dollars when the rate is missing. */
export function formatMoney(usd: number, unit: Unit, fx: Fx | null, opts: MoneyFormat = {}): string {
  const v = fromUsd(usd, unit, fx);
  return v === null ? formatUnit(usd, "USD", opts) : formatUnit(v, unit, opts);
}
