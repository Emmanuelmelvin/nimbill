"use client";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useSession } from "@/lib/client/session";
import { openInNimiqPayLink } from "@/lib/client/nimiq";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-bold text-navy" aria-label="NimBill home">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <path d="M9 3h14l7 13-7 13H9L2 16z" fill="#e9b213" />
        <path d="M11 10h7.5a3.5 3.5 0 0 1 0 7H11zm0 7h8.5a3.5 3.5 0 0 1 0 7H11z" fill="none" stroke="#1f2348" strokeWidth="2.4" strokeLinejoin="round" />
      </svg>
      <span className="text-lg tracking-tight">NimBill</span>
    </Link>
  );
}

export function Header({ back }: { back?: string }) {
  const { merchant } = useSession();
  return (
    <header className="no-print flex h-16 items-center justify-between">
      <div className="flex items-center gap-2">
        {back && (
          <Link href={back} className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-navy hover:bg-white" aria-label="Back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </Link>
        )}
        <Logo />
      </div>
      {merchant && (
        <Link href="/settings" className="flex h-11 items-center gap-2 rounded-full bg-white px-3 text-sm font-medium text-navy shadow-sm" aria-label="Settings">
          <span className="max-w-[9rem] truncate">{merchant.name || "Settings"}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        </Link>
      )}
    </header>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-ok/10 text-ok" },
  unpaid: { label: "Awaiting payment", cls: "bg-gold/15 text-gold-dark" },
  overdue: { label: "Overdue", cls: "bg-bad/10 text-bad" },
  cancelled: { label: "Cancelled", cls: "bg-line text-muted" },
};

export function StatusBadge({ status, dueDate }: { status: string; dueDate?: string | null }) {
  const overdue = status === "unpaid" && dueDate && dueDate < new Date().toISOString().slice(0, 10);
  const s = STATUS[overdue ? "overdue" : status] ?? STATUS.unpaid;
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Notice({ kind = "info", children }: { kind?: "info" | "error" | "success" | "warn"; children: ReactNode }) {
  const cls = {
    info: "bg-navy/5 text-navy",
    error: "bg-bad/10 text-bad",
    success: "bg-ok/10 text-ok",
    warn: "bg-gold/15 text-[#8a6500]",
  }[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${cls}`}>
      {children}
    </div>
  );
}

/** Shown when a wallet action is needed but the page is open in a normal browser. */
const noopSubscribe = () => () => {};
/** window.location.href on the client, "" during server render (no hydration mismatch). */
export function useHref(): string {
  return useSyncExternalStore(noopSubscribe, () => window.location.href, () => "");
}
export function useCanShare(): boolean {
  return useSyncExternalStore(noopSubscribe, () => "share" in navigator, () => false);
}
export function useOrigin(): string {
  return useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
}

export function OpenInNimiqPay({ text = "This needs the Nimiq Pay wallet." }: { text?: string }) {
  const url = useHref();
  return (
    <div className="rounded-2xl border border-gold/40 bg-gold/10 p-4">
      <p className="text-sm text-navy">{text}</p>
      <a href={url ? openInNimiqPayLink(url) : "#"} className="btn-dark mt-3 w-full">
        Open in Nimiq Pay
      </a>
      <p className="mt-2 text-center text-xs text-muted">
        Don&apos;t have it?{" "}
        <a className="underline" href="https://nimiq.com/nimiq-pay" target="_blank" rel="noreferrer">
          Get Nimiq Pay
        </a>
      </p>
    </div>
  );
}

export function Countdown({ until, onExpire }: { until: string; onExpire?: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, Date.parse(until) - Date.now()));
  useEffect(() => {
    const t = setInterval(() => {
      const l = Math.max(0, Date.parse(until) - Date.now());
      setLeft(l);
      if (l === 0) {
        clearInterval(t);
        onExpire?.();
      }
    }, 500);
    return () => clearInterval(t);
  }, [until, onExpire]);
  const s = Math.ceil(left / 1000);
  return (
    <span className="font-mono tabular-nums">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

export function CopyButton({ text, label = "Copy", className = "btn-ghost" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}
