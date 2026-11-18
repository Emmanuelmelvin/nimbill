import "server-only";
import { and, eq, gt, gte, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { mail } from "./clients";
import { getDb, schema } from "./db";
import type { WebhookEndpoint } from "./db/schema";
import { AppError } from "./errors";
import { logger } from "./logger";
import { emailBannerHtml } from "./notifications";
import { siteUrl } from "./site";
import {
  FAILING_MIN_ATTEMPTS,
  FAILING_REMOVE_AFTER_DAYS,
  FAILING_WARN_AFTER_HOURS,
  REMOVAL_NOTICE_HOURS,
  removalDate,
} from "./webhook-policy";

// Endpoints that keep failing. Modelled on Stripe and Svix: judged by how long every delivery has
// failed, not only how many attempts, so a busy store isn't removed over one bad hour.
//
//   every attempt     a 2xx resets the endpoint; anything else counts a failure (recordAttempt)
//   failing 24 h      (and 5+ failures in a row) the merchant is warned: email + Settings + dashboard
//   failing 5 days    (and 48 h+ after the warning) webhooks are removed: turned off, email, Settings
//
// "Removed" turns the endpoint off and says why; it keeps the URL and the secret, so the merchant
// turns it back on by saving a working URL (lib/webhooks.ts saveEndpoint resets all of this).
// The checks run in the webhook worker (worker/index.ts), next to delivery.

/** Called by the worker after every delivery attempt that reached (or tried to reach) the store. */
export async function recordAttempt(endpointId: string, ok: boolean): Promise<void> {
  const db = await getDb();
  const t = schema.webhookEndpoints;
  if (ok) {
    // Only write when there is something to reset, so healthy endpoints cost no extra writes.
    await db
      .update(t)
      .set({ failingSince: null, consecutiveFailures: 0, warnedAt: null })
      .where(and(eq(t.id, endpointId), or(isNotNull(t.failingSince), gt(t.consecutiveFailures, 0))));
    return;
  }
  await db
    .update(t)
    .set({ failingSince: sql`coalesce(${t.failingSince}, now())`, consecutiveFailures: sql`${t.consecutiveFailures} + 1` })
    .where(eq(t.id, endpointId));
}

/** Warn the endpoints that just crossed 24 h of failures and remove the ones past 5 days. Returns how many of each. */
export async function checkEndpointHealth(now = new Date()): Promise<{ warned: number; removed: number }> {
  const db = await getDb();
  const t = schema.webhookEndpoints;
  const failing = and(eq(t.enabled, true), isNotNull(t.failingSince), gte(t.consecutiveFailures, FAILING_MIN_ATTEMPTS));

  // Each step claims the row with a conditional UPDATE … RETURNING, so two workers never email twice.
  const warned = await db
    .update(t)
    .set({ warnedAt: now })
    .where(and(failing, isNull(t.warnedAt), lte(t.failingSince, new Date(now.getTime() - FAILING_WARN_AFTER_HOURS * 3_600_000))))
    .returning();
  for (const ep of warned) {
    logger.warn("webhook endpoint failing: merchant warned", { endpointId: ep.id, failures: ep.consecutiveFailures });
    await emailMerchant(ep, "warning", () => warningEmail(ep, now));
  }

  const removed = await db
    .update(t)
    .set({ enabled: false, disabledReason: "failing", disabledAt: now, updatedAt: now })
    .where(
      and(
        failing,
        lte(t.failingSince, new Date(now.getTime() - FAILING_REMOVE_AFTER_DAYS * 86_400_000)),
        lte(t.warnedAt, new Date(now.getTime() - REMOVAL_NOTICE_HOURS * 3_600_000)),
      ),
    )
    .returning();
  for (const ep of removed) {
    logger.warn("webhook endpoint removed after repeated failures", { endpointId: ep.id, failures: ep.consecutiveFailures });
    await emailMerchant(ep, "removed", () => removedEmail(ep));
  }

  return { warned: warned.length, removed: removed.length };
}

// ---------- email ----------

type Email = { subject: string; text: string; html: string };

/** Sends to the email saved in Settings, if any. Never throws: Settings and the dashboard show the same news. */
async function emailMerchant(ep: WebhookEndpoint, kind: "warning" | "removed", build: () => Email): Promise<void> {
  if (!mail.configured) return;
  try {
    const db = await getDb();
    const [m] = await db
      .select({ email: schema.merchants.email })
      .from(schema.merchants)
      .where(eq(schema.merchants.address, ep.merchantAddress));
    if (!m?.email) return;
    // One key per failing streak, so a retry or a second worker can never send it twice.
    const streak = (kind === "removed" ? ep.disabledAt : ep.failingSince)?.getTime() ?? 0;
    await mail.send({ to: m.email, ...build(), idempotencyKey: `webhook-${kind}/${ep.id}/${streak}` });
    logger.info(`webhook ${kind} email sent`, { endpointId: ep.id });
  } catch (e) {
    const err = e as Error;
    logger.warn(`webhook ${kind} email failed`, {
      endpointId: ep.id,
      error: err.message,
      ...(AppError.is(err) ? { code: err.code, details: err.details } : {}),
    });
  }
}

const utc = (d: Date) => `${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(d)} UTC`;
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The "your webhook URL is failing, it will be removed" message. Exported so the wording can be checked. */
export function warningEmail(ep: WebhookEndpoint, now = new Date()): Email {
  const since = ep.failingSince ?? now;
  const removeAt = removalDate(since, ep.warnedAt ?? now, now);
  return layout({
    subject: `Action needed: your NimBill webhook URL will be removed on ${utc(removeAt)}`,
    heading: "Your webhook URL isn't answering",
    paragraphs: [
      `Every webhook NimBill sent to your store since ${utc(since)} has failed (${ep.consecutiveFailures} attempts in a row).`,
      `If it keeps failing, webhooks will be removed on ${utc(removeAt)}. Your store would then stop hearing about payments, and its signed requests to create invoices would be refused.`,
      "To keep them: make sure your server answers with a 2xx within 10 seconds, or change the URL in Settings → Webhooks. The first webhook that gets through clears this warning. You can check with Send test event, and open any event to see what your server answered.",
    ],
    rows: [
      ["Webhook URL", ep.url],
      ["Failing since", utc(since)],
      ["Removal on", utc(removeAt)],
    ],
    button: "Open webhook settings",
  });
}

/** The "your webhook URL was removed" message. */
export function removedEmail(ep: WebhookEndpoint): Email {
  const at = ep.disabledAt ?? new Date();
  return layout({
    subject: "Your NimBill webhooks were removed after repeated failures",
    heading: "Webhooks were removed",
    paragraphs: [
      `Your webhook URL kept failing${ep.failingSince ? ` since ${utc(ep.failingSince)}` : ""} (${ep.consecutiveFailures} attempts in a row), so NimBill removed it on ${utc(at)}.`,
      "Your store no longer gets webhooks, and its signed requests to create invoices are refused. Payments to your board still reach your wallet as usual.",
      "To turn webhooks back on, fix your server and press Save in Settings → Webhooks. Your secret hasn't changed.",
    ],
    rows: [
      ["Webhook URL", ep.url],
      ["Removed", utc(at)],
    ],
    button: "Turn webhooks back on",
  });
}

function layout({
  subject,
  heading,
  paragraphs,
  rows,
  button,
}: {
  subject: string;
  heading: string;
  paragraphs: string[];
  rows: [string, string][];
  button: string;
}): Email {
  const url = new URL("/settings#webhooks", siteUrl()).toString();
  const why = "You get this email because webhooks are set up for your NimBill board and your email is saved in Settings.";
  const text = [
    heading,
    "",
    ...paragraphs.flatMap((p) => [p, ""]),
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    `${button}: ${url}`,
    "",
    why,
  ].join("\n");

  // Black and white with sharp edges, like the app and the "invoice paid" email. Inline styles only.
  const cell = "padding:10px 0;border-bottom:1px solid #e5e5e5;font-size:14px;";
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#ffffff;color:#000000;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:480px;margin:0 auto;">
${emailBannerHtml()}
<p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#666666;">NimBill · Webhooks</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${escapeHtml(heading)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;">${escapeHtml(p)}</p>`).join("\n")}
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-top:8px;border-collapse:collapse;border-top:1px solid #000000;">
${rows
  .map(
    ([k, v]) =>
      `<tr><td style="${cell}color:#666666;white-space:nowrap;padding-right:12px;">${escapeHtml(k)}</td><td style="${cell}text-align:right;font-weight:600;word-break:break-all;">${escapeHtml(v)}</td></tr>`,
  )
  .join("\n")}
</table>
<p style="margin:24px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 24px;background:#000000;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">${escapeHtml(button)}</a></p>
<p style="margin:0;font-size:12px;color:#666666;">${escapeHtml(why)}</p>
</div>
</body>
</html>`;
  return { subject, text, html };
}
