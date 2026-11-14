import type { ReactNode } from "react";
import type { Field } from "@/lib/api-reference";
import { CopyButton, Eyebrow, cx, withCoins, withCoinsDeep, type NoCoins } from "../ui";

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
// Code is copied as-is, so it never gets coin logos.
(Code as NoCoins).noCoins = true;

export { MethodBadge } from "./MethodBadge";

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
              {withCoins(f.description)}
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
      <h3 className="font-bold">{withCoinsDeep(title)}</h3>
      <div className="mt-1 text-sm text-muted">{withCoinsDeep(children)}</div>
    </div>
  );
}

// ── Page structure, in the Mintlify docs style (but black and white, sharp) ─────────────

/** A docs page: its title, a line under it, and the content. Adds coin logos to the prose. */
export function DocPage({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <article>
      <h1 className="text-3xl leading-tight font-bold tracking-tight sm:text-4xl">{withCoinsDeep(title)}</h1>
      {description && <p className="mt-3 text-lg text-muted">{withCoinsDeep(description)}</p>}
      {/* Coin logos in the prose; code samples (<Code>, <pre>, <code>) are left exactly as written. */}
      <div className="mt-8 space-y-5 text-[15px] leading-relaxed">{withCoinsDeep(children)}</div>
    </article>
  );
}

const ANCHOR = "after:ml-2 after:text-muted after:opacity-0 after:transition-opacity after:content-['#'] hover:after:opacity-100";

/** A section heading with an anchor link. The "On this page" list is made from these. */
export function H2({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <h2 id={id} className={cx("scroll-mt-28 border-t border-line pt-8 text-2xl leading-tight font-bold tracking-tight mt-12", className)}>
      <a href={`#${id}`} className={ANCHOR}>
        {children}
      </a>
    </h2>
  );
}

export function H3({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <h3 id={id} className={cx("scroll-mt-28 text-lg font-bold mt-8", className)}>
      <a href={`#${id}`} className={ANCHOR}>
        {children}
      </a>
    </h3>
  );
}

const CALLOUTS = {
  note: { label: "Note", icon: "i", box: "border-ink" },
  tip: { label: "Tip", icon: "✦", box: "border-line bg-subtle" },
  warning: { label: "Warning", icon: "!", box: "border-ink border-l-4" },
} as const;

/** A highlighted note, tip or warning. */
export function Callout({ type = "note", title, children }: { type?: keyof typeof CALLOUTS; title?: ReactNode; children: ReactNode }) {
  const c = CALLOUTS[type];
  return (
    <aside className={cx("flex gap-3 border p-4 text-sm", c.box)}>
      <span
        aria-hidden
        className={cx(
          "flex h-6 w-6 shrink-0 items-center justify-center border border-ink font-mono text-xs font-bold",
          type === "warning" && "bg-ink text-paper",
        )}
      >
        {c.icon}
      </span>
      <div className="min-w-0">
        <p className="font-semibold">{title ?? c.label}</p>
        <div className="mt-0.5 space-y-2 text-muted">{children}</div>
      </div>
    </aside>
  );
}

/** Numbered steps joined by a line. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="space-y-0">{children}</ol>;
}

export function Step({ n, title, children, id }: { n: number; title: ReactNode; children?: ReactNode; id?: string }) {
  return (
    <li id={id} className="relative scroll-mt-28 pb-8 pl-12 last:pb-0">
      {/* The line down to the next step. */}
      <span aria-hidden className="absolute top-8 bottom-0 left-[0.9375rem] w-px bg-line" />
      <span
        aria-hidden
        className="absolute top-0 left-0 flex h-8 w-8 items-center justify-center border border-ink bg-paper font-mono text-xs font-bold"
      >
        {n}
      </span>
      <p className="pt-1 font-semibold">{title}</p>
      {children && <div className="mt-2 space-y-3 text-sm text-muted">{children}</div>}
    </li>
  );
}

/** A grid of link cards. */
export function Cards({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div className={cx("grid gap-4", cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>{children}</div>;
}

/** A card that links somewhere: a title, a line of text, an optional icon. */
export function Card({ href, title, icon, children }: { href: string; title: ReactNode; icon?: ReactNode; children?: ReactNode }) {
  const external = /^https?:/.test(href);
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="group block border border-ink p-4 transition-colors hover:bg-ink hover:text-paper"
    >
      {icon && (
        <span aria-hidden className="mb-3 flex h-9 w-9 items-center justify-center border border-current font-mono font-bold">
          {icon}
        </span>
      )}
      <span className="flex items-center justify-between gap-2 font-semibold">
        {title}
        <span aria-hidden className="font-mono transition-transform group-hover:translate-x-0.5">
          {external ? "↗" : "→"}
        </span>
      </span>
      {children && <span className="mt-1 block text-sm text-muted group-hover:text-paper/70">{children}</span>}
    </a>
  );
}

/** A box with a heading bar and a list of term + description rows (env vars, options). */
export function DefinitionBox({ title, rows }: { title: string; rows: [term: ReactNode, sub: ReactNode, desc: ReactNode][] }) {
  return (
    <div className="border border-ink">
      <p className="border-b border-ink bg-subtle px-4 py-2 font-mono text-[11px] tracking-wider text-muted uppercase">{title}</p>
      <dl className="divide-y divide-line text-sm">
        {rows.map(([term, sub, desc], i) => (
          <div key={i} className="grid gap-1 p-4 sm:grid-cols-[15rem_1fr] sm:gap-4">
            <dt className="font-mono text-xs break-all">
              <span className="font-semibold text-ink">{term}</span>
              {sub && <span className="mt-0.5 block text-[11px] text-muted">{sub}</span>}
            </dt>
            <dd className="text-muted">{desc}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The black call-to-action box at the end of a page. */
export function CtaBox({ title, text, action }: { title: ReactNode; text: ReactNode; action: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 border border-ink bg-ink p-6 text-paper sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-lg font-bold">{title}</p>
        <p className="text-sm text-paper/70">{text}</p>
      </div>
      {action}
    </div>
  );
}
