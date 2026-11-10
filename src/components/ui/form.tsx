import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

/** Shared look for text inputs, selects and textareas. */
const CONTROL =
  "block min-h-12 w-full border border-edge bg-paper px-4 text-base text-ink outline-none transition-colors placeholder:text-muted/70 hover:border-ink focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--color-ink)] disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted";

export function labelStyles(size: "md" | "sm" = "md") {
  return size === "sm" ? "mb-1 block text-xs font-medium text-muted" : "mb-1.5 block text-sm font-medium text-ink";
}

export function Label({
  optional,
  size,
  className,
  children,
  ...rest
}: ComponentProps<"label"> & { optional?: boolean; size?: "md" | "sm" }) {
  return (
    <label className={cx(labelStyles(size), className)} {...rest}>
      {children}
      {optional && <span className="font-normal text-muted"> (optional)</span>}
    </label>
  );
}

/** A label, a control and an optional hint underneath. */
export function Field({
  label,
  htmlFor,
  optional,
  hint,
  size,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  optional?: boolean;
  hint?: ReactNode;
  size?: "md" | "sm";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} optional={optional} size={size}>
        {label}
      </Label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Input({ mono, className, ...rest }: ComponentProps<"input"> & { mono?: boolean }) {
  return <input className={cx(CONTROL, mono && "font-mono text-sm", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cx(CONTROL, "min-h-24 resize-y py-3", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <div className={cx("relative", className)}>
      <select className={cx(CONTROL, "cursor-pointer appearance-none pr-10")} {...rest}>
        {children}
      </select>
      <svg aria-hidden className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2" width="12" height="12" viewBox="0 0 12 12">
        <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      </svg>
    </div>
  );
}

/** A square checkbox with a label and optional description. */
export function Checkbox({
  label,
  description,
  className,
  ...rest
}: Omit<ComponentProps<"input">, "type"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cx("flex min-h-11 cursor-pointer items-center justify-between gap-4", className)}>
      <span>
        <span className="block font-medium">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </span>
      <span className="relative inline-flex h-6 w-6 shrink-0">
        <input
          type="checkbox"
          className="peer h-6 w-6 cursor-pointer appearance-none border border-ink bg-paper checked:bg-ink"
          {...rest}
        />
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="pointer-events-none absolute inset-0 m-auto hidden h-4 w-4 text-paper peer-checked:block"
        >
          <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
        </svg>
      </span>
    </label>
  );
}

/** A selectable card for picking one option from a list (radio button underneath). */
export function RadioCard({ className, children, ...rest }: Omit<ComponentProps<"input">, "type"> & { children: ReactNode }) {
  return (
    <label
      className={cx(
        "group flex min-h-12 cursor-pointer items-center gap-3 border border-line bg-paper p-3 transition-colors hover:border-ink",
        "has-checked:border-ink has-checked:shadow-[inset_0_0_0_1px_var(--color-ink)]",
        "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink",
        className,
      )}
    >
      <input type="radio" className="sr-only" {...rest} />
      <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center border border-ink">
        <span className="hidden h-2.5 w-2.5 bg-ink group-has-checked:block" />
      </span>
      {children}
    </label>
  );
}

/** A row of joined buttons: tabs (filters) or a radio group (one choice). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  kind = "tabs",
  size = "sm",
  block,
}: {
  options: readonly { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  kind?: "tabs" | "radio";
  size?: "sm" | "md";
  block?: boolean;
}) {
  const tabs = kind === "tabs";
  return (
    <div
      role={tabs ? "tablist" : "radiogroup"}
      aria-label={label}
      className={cx("border border-ink", block ? "flex w-full" : "inline-flex")}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role={tabs ? "tab" : "radio"}
            aria-selected={tabs ? on : undefined}
            aria-checked={tabs ? undefined : on}
            onClick={() => onChange(o.value)}
            className={cx(
              "px-3 font-medium transition-colors",
              size === "sm" ? "min-h-9 text-sm" : "min-h-11 text-base",
              block && "flex-1",
              i > 0 && "border-l border-ink",
              on ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-subtle",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
