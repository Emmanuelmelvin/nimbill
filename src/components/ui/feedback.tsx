import type { ReactNode } from "react";
import { cx } from "./cx";

const SPINNER_SIZES = { sm: "h-4 w-4 border-2", md: "h-5 w-5 border-2", lg: "h-8 w-8 border-[3px]" };

/** A square spinner in the current text color. */
export function Spinner({ size = "md", className }: { size?: keyof typeof SPINNER_SIZES; className?: string }) {
  return <span aria-hidden className={cx("inline-block shrink-0 animate-spin border-current border-r-transparent", SPINNER_SIZES[size], className)} />;
}

/** A centered loading state for a page or section. */
export function Loader({ label = "Loading", compact, className }: { label?: string; compact?: boolean; className?: string }) {
  return (
    <div role="status" className={cx("flex items-center justify-center text-ink", compact ? "py-4" : "py-24", className)}>
      <Spinner size={compact ? "md" : "lg"} />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export type AlertKind = "info" | "success" | "warn" | "error";

const ALERTS: Record<AlertKind, { box: string; icon: string }> = {
  info: { box: "border-line bg-subtle text-ink", icon: "i" },
  success: { box: "border-ink bg-paper text-ink", icon: "✓" },
  warn: { box: "border-dashed border-ink bg-paper text-ink", icon: "!" },
  error: { box: "border-ink bg-ink text-paper", icon: "✕" },
};

/** A message box. Errors are inverted (white on black) so they stand out without color. */
export function Alert({ kind = "info", title, children, className }: { kind?: AlertKind; title?: ReactNode; children?: ReactNode; className?: string }) {
  const a = ALERTS[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cx("flex gap-3 border px-4 py-3 text-sm leading-relaxed", a.box, className)}>
      <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border border-current font-mono text-xs leading-none font-bold">
        {a.icon}
      </span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export type BadgeVariant = "solid" | "outline" | "strong" | "muted";

const BADGES: Record<BadgeVariant, string> = {
  solid: "border-ink bg-ink text-paper",
  outline: "border-ink bg-paper text-ink",
  strong: "border-2 border-ink bg-paper text-ink",
  muted: "border-line bg-subtle text-muted",
};

export function Badge({ variant = "outline", children, className }: { variant?: BadgeVariant; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center border px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider whitespace-nowrap uppercase",
        BADGES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  paid: { label: "Paid", variant: "solid" },
  unpaid: { label: "Awaiting payment", variant: "outline" },
  overdue: { label: "Overdue", variant: "strong" },
  cancelled: { label: "Cancelled", variant: "muted" },
};

export function StatusBadge({ status, dueDate }: { status: string; dueDate?: string | null }) {
  const overdue = status === "unpaid" && dueDate && dueDate < new Date().toISOString().slice(0, 10);
  const s = STATUS[overdue ? "overdue" : status] ?? STATUS.unpaid;
  return (
    <Badge variant={s.variant} className={status === "cancelled" ? "line-through" : undefined}>
      {s.label}
    </Badge>
  );
}

export function EmptyState({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-edge px-5 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
