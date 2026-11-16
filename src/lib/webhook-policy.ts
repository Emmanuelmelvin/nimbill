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
