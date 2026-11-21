"use client";
import { AnchorButton, Badge, CopyButton, copyText, cx, Dropdown, useOrigin, type DropdownOption } from "@/components/ui";
import type { PublicInvoice } from "@/lib/client/api";
import { openInNimiqPayLink } from "@/lib/client/nimiq";
import { toast } from "@/lib/client/toast";
import { formatFiat } from "@/lib/currencies";
import { localDate, parseLocalDate } from "@/lib/earnings";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `to`, both "YYYY-MM-DD" (local days, so DST shifts don't matter). */
function daysBetween(from: string, to: string): number {
  return Math.round((parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / DAY_MS);
}

function formatDay(day: string): string {
  const d = parseLocalDate(day);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "just now", "5 min ago", "3 h ago", "2 days ago", then a date. */
export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${plural(Math.floor(s / 86400), "day")} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** How many days past its due date an unpaid invoice is; 0 when not overdue (or no due date). */
export function daysOverdue(inv: PublicInvoice, today = localDate()): number {
  if (inv.status !== "unpaid" || !inv.dueDate || inv.dueDate >= today) return 0;
  return daysBetween(inv.dueDate, today);
}

/** The reminder text, worded for where the invoice stands against its due date. */
export function reminderMessage(inv: PublicInvoice, link: string, today = localDate()): string {
  const amount = formatFiat(inv.total, inv.currency);
  let when = "is still open";
  if (inv.dueDate) {
    const late = daysBetween(inv.dueDate, today);
    if (late > 0) when = `was due on ${formatDay(inv.dueDate)} (${plural(late, "day")} ago)`;
    else if (late === 0) when = "is due today";
    else when = `is due on ${formatDay(inv.dueDate)}`;
  }
  const assets = inv.acceptsUsdt ? "NIM or USDT" : "NIM";
  return [
    `Hi ${inv.clientName.trim()}, a friendly reminder that invoice ${inv.number} from ${inv.merchantName} for ${amount} ${when}.`,
    ``,
    `You can pay it in ${assets} here: ${link}`,
    ``,
    `Thank you!`,
  ].join("\n");
}

/**
 * One-tap reminder: WhatsApp with the message ready to send, the message copied, or an email
 * when the client's address is known. Nothing goes through NimBill: it opens the merchant's own apps.
 */
export function RemindActions({
  inv,
  clientEmail,
  size = "md",
  className,
}: {
  inv: PublicInvoice;
  clientEmail?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const origin = useOrigin();
  if (!origin) return null;
  const message = reminderMessage(inv, openInNimiqPayLink(`${origin}/i/${inv.id}`));
  const btn = size === "sm" ? "min-h-10" : undefined;
  const subject = `Reminder: invoice ${inv.number} from ${inv.merchantName}`;
  return (
    <div className={cx("grid gap-2", clientEmail ? "grid-cols-3" : "grid-cols-2", className)}>
      <AnchorButton
        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noreferrer"
        size={size}
        className={btn}
      >
        WhatsApp
      </AnchorButton>
      {clientEmail && (
        <AnchorButton
          href={`mailto:${encodeURIComponent(clientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`}
          variant="secondary"
          size={size}
          className={btn}
        >
          Email
        </AnchorButton>
      )}
      <CopyButton text={message} label="Copy" size={size} className={btn} />
    </div>
  );
}

type ReminderPick = "" | "whatsapp" | "email" | "copy";

/**
 * Compact overdue reminder: a chip saying how late the invoice is, and a "Send reminder" menu
 * beside it (WhatsApp, Email when the client's address is known, Copy message). Nothing is shown
 * expanded; picking an option opens the merchant's own app or copies the message.
 */
export function RemindMenu({ inv, clientEmail, className }: { inv: PublicInvoice; clientEmail?: string | null; className?: string }) {
  const origin = useOrigin();
  if (!origin) return null;
  const late = daysOverdue(inv);
  const message = reminderMessage(inv, openInNimiqPayLink(`${origin}/i/${inv.id}`));
  const subject = `Reminder: invoice ${inv.number} from ${inv.merchantName}`;
  const options: DropdownOption<ReminderPick>[] = [
    { value: "whatsapp", label: "WhatsApp" },
    ...(clientEmail ? [{ value: "email" as const, label: "Email", detail: clientEmail }] : []),
    { value: "copy", label: "Copy message" },
  ];

  const send = async (pick: ReminderPick) => {
    if (pick === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noreferrer");
    } else if (pick === "email" && clientEmail) {
      window.location.href = `mailto:${encodeURIComponent(clientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    } else if (pick === "copy") {
      await copyText(message);
      toast.success("Reminder copied", { description: "Paste it into any chat or email." });
    }
  };

  return (
    <div className={cx("flex items-center gap-2", className)}>
      {late > 0 && <Badge variant="strong">{late === 1 ? "1 day overdue" : `${late} days overdue`}</Badge>}
      {/* Always shows "Send reminder": the menu triggers an action rather than keeping a choice. */}
      <Dropdown
        aria-label={`Send ${inv.clientName} a reminder`}
        options={options}
        value=""
        placeholder="Send reminder"
        onChange={(pick) => void send(pick)}
        labels="name"
        size="sm"
      />
    </div>
  );
}

/** "Sent → Viewed → Paid" for the merchant: whether the client has opened the invoice yet. */
export function ViewedStatus({ viewedAt, className }: { viewedAt: string | null; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 font-mono text-[11px] text-muted", className)}>
      <span aria-hidden className={cx("h-1.5 w-1.5", viewedAt ? "bg-ink" : "border border-muted")} />
      {viewedAt ? `Viewed ${timeAgo(viewedAt)}` : "Not opened yet"}
    </span>
  );
}
