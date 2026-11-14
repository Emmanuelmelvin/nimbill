"use client";
import { useSyncExternalStore } from "react";
import { CopyButton, cx } from "../ui";
import type { CodeTab } from "./snippets";

// The language a reader picked (curl, JavaScript, Python) is remembered and shared by every code
// group on every page, so switching once switches them all.
const KEY = "nimbill-docs-lang";
const EVENT = "nimbill-docs-lang";

function readLang(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function pickLang(label: string) {
  try {
    localStorage.setItem(KEY, label);
  } catch {
    // Private mode: the choice just isn't remembered.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Code in several languages, with tabs and a copy button for the one showing. */
export function CodeGroup({ tabs, title, className }: { tabs: CodeTab[]; title?: string; className?: string }) {
  const lang = useSyncExternalStore(subscribe, readLang, () => null);
  const active = Math.max(
    0,
    tabs.findIndex((t) => t.label === lang),
  );
  const tab = tabs[active];
  return (
    <div className={cx("max-w-full min-w-0 border border-ink", className)}>
      <div className="flex min-h-10 items-stretch justify-between gap-2 border-b border-ink bg-subtle">
        <div role="tablist" aria-label={title ?? "Language"} className="flex min-w-0 items-stretch overflow-x-auto overflow-y-hidden">
          {title && (
            <span className="flex items-center border-r border-ink px-3 font-mono text-[11px] tracking-wider whitespace-nowrap text-muted uppercase">
              {title}
            </span>
          )}
          {tabs.map((t, i) => (
            <button
              key={t.label}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => pickLang(t.label)}
              className={cx(
                "border-y-2 border-t-transparent px-3 font-mono text-[11px] font-semibold tracking-wider whitespace-nowrap uppercase transition-colors",
                i === active ? "border-b-ink text-ink" : "border-b-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <CopyButton text={tab.code} size="sm" variant="ghost" className="min-h-10 shrink-0 border-l border-ink" />
      </div>
      <pre role="tabpanel" className="max-h-[28rem] overflow-auto p-3 font-mono text-xs leading-relaxed whitespace-pre">
        {tab.code}
      </pre>
    </div>
  );
}
