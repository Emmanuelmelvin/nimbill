"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { boardPath } from "@/lib/board";
import { formatTag } from "@/lib/tags";
import { Button, CopyButton, Eyebrow, cardStyles, cx, useCanShare, useOrigin } from "./ui";

const ICON = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "square",
} as const;

type Action = { label: string; icon: ReactNode; href: string; primary?: boolean; soon?: boolean };

// `soon`: not built yet. Shown greyed with "Soon", and leads to a page about what's coming.
const ACTIONS: Action[] = [
  { label: "New invoice", href: "/new", primary: true, icon: <path d="M12 5v14M5 12h14" /> },
  { label: "Send", href: "/send", icon: <path d="M7 17L17 7M9 7h8v8" /> },
  { label: "Pay", href: "/pay", icon: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" /> },
  { label: "Cheque", href: "/cheques", soon: true, icon: <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" /> },
  {
    label: "Cash",
    href: "/cheques#cash",
    soon: true,
    icon: (
      <>
        <path d="M3 7h18v10H3z" />
        <circle cx="12" cy="12" r="2" />
      </>
    ),
  },
];

/** The row of five things you can do from home. */
export function ActionStrip() {
  return (
    <nav aria-label="Actions" className="grid grid-cols-5 border border-ink">
      {ACTIONS.map((a, i) => {
        const cell = cx(
          "flex min-h-[4.5rem] flex-col items-center justify-center gap-1 px-1 py-2 text-center text-[11px] leading-tight font-semibold",
          i > 0 && "border-l border-line",
        );
        const body = (
          <>
            <svg aria-hidden {...ICON}>
              {a.icon}
            </svg>
            {a.label}
          </>
        );
        return (
          <Link
            key={a.label}
            href={a.href}
            aria-label={a.soon ? `${a.label} (coming soon)` : undefined}
            className={cx(
              cell,
              "transition-colors",
              a.primary
                ? "bg-ink text-paper hover:bg-ink-soft"
                : a.soon
                  ? "text-muted hover:bg-subtle hover:text-ink"
                  : "text-ink hover:bg-subtle",
            )}
          >
            {body}
            {a.soon && <span className="font-mono text-[9px] font-medium tracking-wider uppercase">Soon</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The merchant's tag and pay link, ready to copy or share. The link opens their public board,
 * where anyone can pay them; the tag is what other NimBill users send to.
 */
export function TagRow({ tag }: { tag: string }) {
  const handle = formatTag(tag);
  const origin = useOrigin();
  const url = `${origin}${boardPath(tag)}`;
  const canShare = useCanShare();
  const [shareError, setShareError] = useState(false);
  return (
    <div className={cardStyles({ padding: "sm", className: "flex items-center justify-between gap-3" })}>
      <div className="min-w-0">
        <Eyebrow>Your pay link</Eyebrow>
        <p className="mt-0.5 truncate font-mono text-sm font-semibold">{handle}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <CopyButton text={url} label="Copy link" size="sm" className="min-h-10" />
        {canShare && (
          <Button
            variant="secondary"
            size="sm"
            className="min-h-10"
            aria-label="Share your pay link"
            onClick={async () => {
              setShareError(false);
              try {
                await navigator.share({ text: `Pay me on NimBill: ${handle}`, url });
              } catch (e) {
                // Closing the share sheet is not an error.
                if ((e as Error).name !== "AbortError") setShareError(true);
              }
            }}
          >
            {shareError ? "Try again" : "Share"}
          </Button>
        )}
      </div>
    </div>
  );
}
