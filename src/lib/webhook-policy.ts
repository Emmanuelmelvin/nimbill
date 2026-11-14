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

/** Board invoices a merchant's own store may create (signed requests) in 10 minutes. */
export const STORE_INVOICES_PER_10_MIN = 300;
/** Board invoices anyone else may start on one board in 10 minutes, all together. */
export const BOARD_INVOICES_PER_10_MIN = 30;
/** Board invoices one IP address may start per minute without a signature. */
export const ANON_INVOICES_PER_IP_PER_MIN = 10;

/** "1 min, 5 min, 15 min, 1 h …" for people. */
export const retryScheduleText = () => RETRY_DELAYS_MIN.map((m) => (m < 60 ? `${m} min` : `${m / 60} h`)).join(", ");
