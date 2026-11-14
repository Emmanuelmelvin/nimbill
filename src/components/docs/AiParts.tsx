import type { ReactNode } from "react";
import { AI_LOGOS, AiLogo } from "../AiLogos";
import { cx } from "../ui";

const logo = (key: string) => AI_LOGOS.find((l) => l.key === key)!;

/** The row of AI tool logos ("Works with…"). */
export function LogoStrip({ title, footnote }: { title: string; footnote?: ReactNode }) {
  return (
    <div className="border border-ink">
      <p className="border-b border-ink bg-subtle px-4 py-2 font-mono text-[11px] tracking-wider text-muted uppercase">{title}</p>
      <ul className="grid grid-cols-3 sm:grid-cols-6">
        {AI_LOGOS.map((l, i) => (
          <li
            key={l.key}
            className={cx(
              "group flex flex-col items-center gap-2 px-2 py-5 transition-colors hover:bg-ink hover:text-paper",
              i % 3 !== 0 && "border-l border-line",
              i >= 3 && "border-t border-line sm:border-t-0",
              i === 3 && "sm:border-l",
            )}
          >
            <AiLogo logo={l} size={30} />
            <span className="text-xs font-semibold">{l.name}</span>
          </li>
        ))}
      </ul>
      {footnote && <p className="border-t border-line px-4 py-2 text-xs text-muted">{footnote}</p>}
    </div>
  );
}

/** A card for one AI tool or MCP client: its logos and a heading (in "On this page"), then the steps. */
export function ToolCard({
  id,
  logos,
  title,
  solid,
  children,
}: {
  id: string;
  logos: string[];
  title: string;
  /** A black header, for the recommended option. */
  solid?: boolean;
  children: ReactNode;
}) {
  return (
    <article className="border border-ink">
      <header className={cx("flex items-center gap-3 border-b border-ink p-4", solid && "bg-ink text-paper")}>
        {logos.length > 0 ? (
          <span className="flex items-center gap-2">
            {logos.map((k) => (
              <span key={k} className="flex h-10 w-10 items-center justify-center border border-current">
                <AiLogo logo={logo(k)} size={22} />
              </span>
            ))}
          </span>
        ) : (
          !solid && (
            <span aria-hidden className="flex h-10 w-10 items-center justify-center border border-current font-mono font-bold">
              {"{}"}
            </span>
          )
        )}
        <h3 id={id} className="scroll-mt-28 font-bold">
          {title}
        </h3>
      </header>
      <div className="space-y-3 p-4 text-sm text-muted">{children}</div>
    </article>
  );
}

/** A single logo, for cards and links. */
export function Logo({ name, size = 20 }: { name: string; size?: number }) {
  return <AiLogo logo={logo(name)} size={size} />;
}
