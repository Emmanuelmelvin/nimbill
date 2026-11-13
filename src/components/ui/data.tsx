import type { ReactNode } from "react";
import { cardStyles } from "./card";
import { withCoins } from "./coins";
import { cx } from "./cx";

/** Small uppercase label above a value. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("font-mono text-[11px] font-medium tracking-wider text-muted uppercase", className)}>{withCoins(children)}</p>;
}

/** A number with a label, for summaries and dashboards. */
export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cardStyles({ padding: "sm", className })}>
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-1.5 text-xl leading-tight font-bold break-words tabular-nums">{withCoins(value)}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{withCoins(sub)}</p>}
    </div>
  );
}

export type DescriptionRow = { term: ReactNode; detail: ReactNode; mono?: boolean };

/** Label/value pairs in two columns. */
export function DescriptionList({ rows, className }: { rows: DescriptionRow[]; className?: string }) {
  return (
    <dl className={cx("grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2", className)}>
      {rows.map((r, i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{withCoins(r.term)}</dt>
          {/* Mono rows are addresses and hashes: left exactly as they are. */}
          <dd className={cx("min-w-0 break-words", r.mono && "font-mono text-xs break-all")}>{r.mono ? r.detail : withCoins(r.detail)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Monospace box for links, addresses and hashes. */
export function CodeBlock({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("border border-line bg-subtle p-3 font-mono text-xs break-all", className)}>{children}</div>;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cx("border-line", className)} />;
}
