import type { ReactNode } from "react";
import type { Field } from "@/lib/api-reference";
import { CopyButton, Eyebrow, cx } from "../ui";

/** A numbered section with an anchor, in the "01 / Label" style. */
export function Section({
  id,
  index,
  label,
  title,
  intro,
  children,
}: {
  id: string;
  index: string;
  label: string;
  title: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-line pt-10">
      <Eyebrow>
        {index} / {label}
      </Eyebrow>
      <h2 className="mt-2 text-2xl leading-tight font-bold tracking-tight sm:text-3xl">{title}</h2>
      {intro && <div className="mt-3 max-w-2xl text-muted">{intro}</div>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** A block of code or text with a copy button. `label` names what it is (a file name, "curl"…). */
export function Code({
  children,
  label,
  copy = true,
  className,
}: {
  children: string;
  label?: string;
  copy?: boolean;
  className?: string;
}) {
  return (
    // min-w-0: in a grid, a box otherwise grows to its longest line instead of scrolling it.
    <div className={cx("max-w-full min-w-0 border border-ink", className)}>
      {(label || copy) && (
        <div className="flex min-h-10 items-center justify-between gap-3 border-b border-ink bg-subtle pl-3">
          <span className="truncate font-mono text-[11px] tracking-wider text-muted uppercase">{label}</span>
          {copy && <CopyButton text={children} size="sm" variant="ghost" className="min-h-10 shrink-0 border-l border-ink" />}
        </div>
      )}
      <pre className="max-h-[28rem] overflow-auto p-3 font-mono text-xs leading-relaxed whitespace-pre">{children}</pre>
    </div>
  );
}

export function MethodBadge({ method }: { method: "GET" | "POST" }) {
  return (
    <span
      className={cx(
        "inline-block w-12 shrink-0 border border-ink py-0.5 text-center font-mono text-[11px] font-bold",
        method === "POST" && "bg-ink text-paper",
      )}
    >
      {method}
    </span>
  );
}

/** Request fields as a list (not a table, so it fits a phone). */
export function Fields({ title, fields }: { title: string; fields: Field[] }) {
  return (
    <div>
      <Eyebrow className="mb-2">{title}</Eyebrow>
      <dl className="divide-y divide-line border border-line">
        {fields.map((f) => (
          <div key={f.name} className="grid gap-1 p-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
            <dt className="font-mono text-xs">
              <span className="font-semibold">{f.name}</span>
              <span className="text-muted"> {f.type}</span>
              {f.required && <span className="ml-1 border border-ink px-1 text-[10px] font-semibold uppercase">required</span>}
            </dt>
            <dd className="text-sm text-muted">
              {f.description}
              {f.enum && f.enum.length <= 4 && <span className="font-mono text-xs text-ink"> ({f.enum.join(" | ")})</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** A small card with a title and text, for lists of reasons and options. */
export function Tile({
  icon,
  title,
  children,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("border border-ink p-5", className)}>
      {icon && (
        <span aria-hidden className="mb-4 flex h-10 w-10 items-center justify-center border border-current font-mono text-lg font-bold">
          {icon}
        </span>
      )}
      <h3 className="font-bold">{title}</h3>
      <div className="mt-1 text-sm text-muted">{children}</div>
    </div>
  );
}
