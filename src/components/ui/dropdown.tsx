"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";
import { CONTROL } from "./form";

export type DropdownOption<T extends string = string> = {
  value: T;
  /** Main text, e.g. "USD". */
  label: string;
  /** Secondary text shown muted next to the label, e.g. "US Dollar". */
  detail?: string;
  /** Leading visual, e.g. a flag. */
  icon?: ReactNode;
};

/**
 * A custom select: a button that opens a list of options, each with an optional icon.
 * Keyboard: arrows / Home / End move, Enter or Space picks, Escape closes, typing jumps to a match.
 */
export function Dropdown<T extends string>({
  id,
  options,
  value,
  onChange,
  placeholder = "Select…",
  disabled,
  className,
  labels = "code",
  "aria-label": ariaLabel,
}: {
  id?: string;
  options: readonly DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** "code": short labels in a fixed column (USD · US Dollar). "name": long labels get the room, the detail sits on the right. */
  labels?: "code" | "name";
  "aria-label"?: string;
}) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];

  const show = () => {
    setActive(Math.max(selectedIndex, 0));
    setOpen(true);
  };
  const pick = (i: number) => {
    const o = options[i];
    if (o && o.value !== value) onChange(o.value);
    setOpen(false);
  };

  // Close when tapping outside (blur alone is unreliable on touch devices).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        e.preventDefault();
        if (!open) return show();
        const step = e.key === "ArrowDown" ? 1 : -1;
        return setActive((i) => Math.min(last, Math.max(0, i + step)));
      }
      case "Home":
      case "End":
        if (!open) return;
        e.preventDefault();
        return setActive(e.key === "Home" ? 0 : last);
      case "Enter":
      case " ":
        e.preventDefault();
        return open ? pick(active) : show();
      case "Escape":
        if (!open) return;
        e.preventDefault();
        return setOpen(false);
      case "Tab":
        return setOpen(false);
    }
    // Type to jump: "n" → NGN, "eur" → Euro.
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      const text = (now - typed.current.at > 600 ? "" : typed.current.text) + e.key.toLowerCase();
      typed.current = { text, at: now };
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(text) || o.detail?.toLowerCase().startsWith(text));
      if (hit < 0) return;
      if (open) setActive(hit);
      else pick(hit);
    }
  };

  return (
    <div ref={root} className={cx("relative", className)}>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        // Space "clicks" a button on key-up; we already handled it on key-down.
        onKeyUp={(e) => e.key === " " && e.preventDefault()}
        onBlur={() => setOpen(false)}
        className={cx(CONTROL, "cursor-pointer text-left", open && "border-ink shadow-[inset_0_0_0_1px_var(--color-ink)]")}
      >
        <span className="flex items-center gap-2.5">
          {selected ? (
            <>
              {selected.icon}
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{selected.label}</span>
                {selected.detail && <span className="text-muted"> · {selected.detail}</span>}
              </span>
            </>
          ) : (
            <span className="min-w-0 flex-1 truncate text-muted/70">{placeholder}</span>
          )}
          <svg aria-hidden className={cx("shrink-0 transition-transform", open && "rotate-180")} width="12" height="12" viewBox="0 0 12 12">
            <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
          </svg>
        </span>
      </button>

      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          // Keep focus on the button while clicking or scrolling the list.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute top-full left-0 z-30 mt-1 max-h-72 w-72 max-w-[calc(100vw-2.5rem)] min-w-full origin-top animate-[pop_0.12s_ease-out] overflow-y-auto overscroll-contain border border-ink bg-paper py-1"
        >
          {options.map((o, i) => {
            const on = i === selectedIndex;
            return (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={on}
                onMouseMove={() => setActive(i)}
                onClick={() => pick(i)}
                className={cx("flex min-h-11 cursor-pointer items-center gap-3 px-4", i === active && "bg-subtle")}
              >
                {o.icon}
                <span className={cx(labels === "code" ? "w-10 shrink-0" : "min-w-0 flex-1 truncate", on ? "font-bold" : "font-medium")}>
                  {o.label}
                </span>
                {o.detail && (
                  <span className={cx("truncate text-sm text-muted", labels === "code" ? "min-w-0 flex-1" : "max-w-[45%] shrink-0")}>
                    {o.detail}
                  </span>
                )}
                {on && (
                  <svg aria-hidden viewBox="0 0 16 16" className="ml-auto h-4 w-4 shrink-0">
                    <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
