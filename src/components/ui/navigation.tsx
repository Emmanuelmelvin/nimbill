"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSession } from "@/lib/client/session";
import { LinkButton } from "./button";
import { cx } from "./cx";

/** The NimBill mark: a receipt with a torn (zigzag) edge and an "N". Same shape as app/icon.svg. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={className}>
      <path d="M5 2H27V26L24.25 30L21.5 26L18.75 30L16 26L13.25 30L10.5 26L7.75 30L5 26Z" fill="currentColor" />
      <path d="M11 20V9L21 20V9" fill="none" className="stroke-paper" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-ink" aria-label="NimBill home">
      <LogoMark />
      <span className="text-lg font-bold tracking-tighter">NimBill</span>
    </Link>
  );
}

export function Header({ back }: { back?: string }) {
  const { merchant } = useSession();
  return (
    <header className="no-print mb-6 flex h-16 items-center justify-between gap-3 border-b border-line">
      <div className="flex items-center gap-1">
        {back && (
          <LinkButton href={back} variant="ghost" size="icon" className="-ml-3" aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </LinkButton>
        )}
        <Logo />
      </div>
      {merchant && (
        <LinkButton href="/settings" variant="secondary" size="sm" aria-label="Settings">
          <span className="max-w-[9rem] truncate">{merchant.name || "Settings"}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </LinkButton>
      )}
    </header>
  );
}

/** Page heading with an optional line of description. */
export function PageTitle({ title, description, className }: { title: ReactNode; description?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-5", className)}>
      <h1 className="text-2xl leading-tight font-bold tracking-tight">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
    </div>
  );
}

const LINK = "underline decoration-1 underline-offset-4 hover:decoration-2";

/** An underlined text link. `external` opens in a new tab. */
export function TextLink({
  href,
  external,
  muted,
  className,
  children,
}: {
  href: string;
  external?: boolean;
  muted?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const cls = cx(LINK, muted ? "text-muted hover:text-ink" : "text-ink", className);
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

/** A collapsible section (native <details>). */
export function Disclosure({ summary, children, className }: { summary: ReactNode; children: ReactNode; className?: string }) {
  return (
    <details className={cx("group border-t border-line", className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium">
        {summary}
        <span aria-hidden className="font-mono text-base transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="space-y-2 pb-1">{children}</div>
    </details>
  );
}

const TAB_ICON = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "square",
} as const;

const TABS = [
  { href: "/", label: "Home", icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> },
  { href: "/invoices", label: "Invoices", icon: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" /> },
  { href: "/save", label: "Save", icon: <path d="M12 3v18M3 12h18M5 5h14v14H5z" /> },
  { href: "/withdraw", label: "Withdraw", icon: <path d="M12 4v12M7 11l5 5 5-5M4 20h16" /> },
] as const;

/**
 * The signed-in app's main navigation: a bar along the bottom on phones (where NimBill mostly
 * runs, inside Nimiq Pay), a rail to the right of the page on wide screens.
 */
export function TabBar() {
  const path = usePathname();
  return (
    <>
      {/* Keeps the last bit of the page clear of the fixed bar. */}
      <div aria-hidden className="no-print h-16 lg:hidden" />
      <nav
        aria-label="Main"
        className={cx(
          "no-print fixed inset-x-0 bottom-0 z-20 border-t border-ink bg-paper pb-[var(--safe-area-inset-bottom,env(safe-area-inset-bottom))]",
          "lg:inset-x-auto lg:top-24 lg:bottom-auto lg:left-[calc(50%+19.5rem)] lg:w-40 lg:border lg:pb-0",
        )}
      >
        <ul className="mx-auto grid max-w-xl grid-cols-4 lg:grid-cols-1">
          {TABS.map((t, i) => {
            const on = t.href === "/" ? path === "/" : path.startsWith(t.href);
            return (
              <li key={t.href} className={cx(i > 0 && "border-l border-line lg:border-t lg:border-l-0")}>
                <Link
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  className={cx(
                    "flex h-14 flex-col items-center justify-center gap-0.5 transition-colors lg:h-12 lg:flex-row lg:justify-start lg:gap-3 lg:px-4",
                    on ? "bg-ink text-paper" : "text-ink hover:bg-subtle",
                  )}
                >
                  <svg aria-hidden {...TAB_ICON}>
                    {t.icon}
                  </svg>
                  <span className="font-mono text-[11px] font-semibold tracking-wider uppercase lg:text-xs">{t.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
