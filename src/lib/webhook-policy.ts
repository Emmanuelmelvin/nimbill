// "Pay with NimBill" numbers, in one place: the worker, the API and the docs all read them here,
// so what the docs promise is what the code does. Shared by the server and the browser.

/** Wait before each retry, in minutes: retry 1 comes 1 minute after the first attempt fails. About 3 days in all. */
export const RETRY_DELAYS_MIN = [1, 5, 15, 60, 180, 360, 720, 1440, 1440];
/** First attempt plus the retries. */
export const MAX_ATTEMPTS = RETRY_DELAYS_MIN.length + 1;
/** A store must answer within this many seconds, or the attempt counts as failed. */
export const DELIVERY_TIMEOUT_S = 10;
/** How long the old secret keeps working after "New secret". */
export const ROTATION_OVERLAP_HOURS = 24;

// The events a store can choose in Settings → Webhooks. Events it didn't choose are never queued,
// so they can't fail and count against its URL. webhook.test always goes out when asked for.
export const STORE_EVENTS = [
  { type: "invoice.paid", label: "Paid", description: "An invoice was paid and confirmed on-chain." },
  { type: "invoice.expired", label: "Expired", description: "Nobody paid in time. Release the stock." },
  {
    type: "invoice.payment_issue",
    label: "Payment issue",
    description: "NIM arrived for an invoice but didn't pay it: too little, too late, or twice.",
  },
] as const;
export type StoreEventType = (typeof STORE_EVENTS)[number]["type"];
export const STORE_EVENT_TYPES: StoreEventType[] = STORE_EVENTS.map((e) => e.type);

// Store invoices expire, so a store can release stock that was held for an order nobody paid.
/** How long a store invoice can be paid when the store doesn't say (`expiresInMinutes`). */
export const STORE_INVOICE_EXPIRY_DEFAULT_MIN = 24 * 60;
export const STORE_INVOICE_EXPIRY_MIN_MIN = 15;
/** At most 3 days, well inside the 7 days payments are looked for (reconcileMerchant), price locks and watching included. */
export const STORE_INVOICE_EXPIRY_MAX_MIN = 3 * 24 * 60;
/**
 * How long after a price lock ends its payment can still show up (grace + time to confirm). The
 * worker watches store invoices this long after each lock, and only then sends invoice.expired, so
 * a store never gets invoice.expired and then invoice.paid for the same invoice.
 */
export const WATCH_AFTER_LOCK_MIN = 30;

// An endpoint that keeps failing (like Stripe and Svix: judged by how long, not just how many, so a
// busy store isn't punished for one bad hour). Any delivery that gets a 2xx resets all of this.
/** Never warn or remove before this many failed attempts in a row. */
export const FAILING_MIN_ATTEMPTS = 5;
/** Every delivery failing for this long: the merchant is warned by email and in the app. */
export const FAILING_WARN_AFTER_HOURS = 24;
/** Every delivery failing for this long: webhooks are removed (turned off). */
export const FAILING_REMOVE_AFTER_DAYS = 5;
/** The warning always comes at least this long before the removal. */
export const REMOVAL_NOTICE_HOURS = 48;

/** When a failing endpoint will be removed: 5 days after it started failing, and at least 48 h after the warning. */
export function removalDate(failingSince: Date, warnedAt: Date | null, now = new Date()): Date {
  const byAge = failingSince.getTime() + FAILING_REMOVE_AFTER_DAYS * 86_400_000;
  const byNotice = (warnedAt ?? now).getTime() + REMOVAL_NOTICE_HOURS * 3_600_000;
  return new Date(Math.max(byAge, byNotice));
}

/** Board invoices a merchant's own store may create (signed requests) in 10 minutes. */
export const STORE_INVOICES_PER_10_MIN = 300;
/** Board invoices anyone else may start on one board in 10 minutes, all together. */
export const BOARD_INVOICES_PER_10_MIN = 30;
/** Board invoices one IP address may start per minute without a signature. */
export const ANON_INVOICES_PER_IP_PER_MIN = 10;

/** "1 min, 5 min, 15 min, 1 h …" for people. */
export const retryScheduleText = () => RETRY_DELAYS_MIN.map((m) => (m < 60 ? `${m} min` : `${m / 60} h`)).join(", ");
