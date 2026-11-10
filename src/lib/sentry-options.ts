// Shared Sentry settings for the browser, Node.js and Edge runtimes.
// Sentry is off unless NEXT_PUBLIC_SENTRY_DSN is set. Invoices contain client names and emails and
// requests carry session cookies, so collection is locked down and anything that slips through is
// scrubbed before sending.
import type { ErrorEvent, Log } from "@sentry/nextjs";

const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi;
const scrubText = (s: string) => s.replace(EMAIL, "[email]");

function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.headers) event.request.headers = { "user-agent": event.request.headers["user-agent"] ?? "" };
  }
  if (event.message) event.message = scrubText(event.message);
  for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = scrubText(ex.value);
  return event;
}

function scrubLog(log: Log): Log {
  if (typeof log.message === "string") log.message = scrubText(log.message);
  return log;
}

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const isProd = process.env.NODE_ENV === "production";

export const sentryOptions = {
  dsn,
  enabled: !!dsn,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  // Performance tracing: every request in development, 10% in production.
  tracesSampleRate: isProd ? 0.1 : 1,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: { allow: ["user-agent", "content-type", "accept"] }, response: false },
    httpBodies: [] as never[],
    urlQueryParams: false,
    databaseQueryData: false,
    stackFrameVariables: false,
  },
  beforeSend: scrubEvent,
  beforeSendLog: scrubLog,
};
