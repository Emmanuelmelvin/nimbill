import "server-only";
import * as Sentry from "@sentry/nextjs";
import winston from "winston";
import Transport from "winston-transport";
import { env, isProd } from "./env";

// Server logger (winston). JSON lines in production (Vercel collects stdout), readable colored
// lines in development. When Sentry is configured, info/warn/error also go to Sentry Logs.
// Personal data is redacted before anything is written: see REDACT below.

/** Keys whose values never get logged. */
const REDACT =
  /^(client_?email|email|cookie|set-cookie|authorization|signature|public_?key|session_?secret|secret|password|token|api_?key|x-cg-demo-api-key)$/i;
const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi;

function scrub(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.replace(EMAIL, "[email]");
  if (!value || typeof value !== "object" || depth > 4) return value;
  if (value instanceof Error)
    return { name: value.name, message: scrub(value.message, depth + 1), ...(isProd ? {} : { stack: value.stack }) };
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, REDACT.test(k) ? "[redacted]" : scrub(v, depth + 1)]));
}

// Mutates `info` in place (winston keeps internal symbol keys on it).
const redact = winston.format((info) => {
  for (const key of Object.keys(info)) info[key] = REDACT.test(key) ? "[redacted]" : scrub(info[key]);
  return info;
});

const devLine = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  delete meta.service;
  const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `${String(timestamp).slice(11, 23)} ${level} ${message}${rest}`;
});

export const logger = winston.createLogger({
  level: env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  defaultMeta: { service: "nimbill" },
  format: winston.format.combine(
    redact(),
    winston.format.timestamp(),
    isProd ? winston.format.json() : winston.format.combine(winston.format.colorize(), devLine),
  ),
  transports: [new winston.transports.Console({ stderrLevels: ["error"] })],
});

if (env.NEXT_PUBLIC_SENTRY_DSN) {
  const SentryTransport = Sentry.createSentryWinstonTransport(Transport, { levels: ["error", "warn", "info"] });
  logger.add(new SentryTransport());
}
