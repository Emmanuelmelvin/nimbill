import Link from "next/link";
import type { ReactNode } from "react";
import { Eyebrow, LogoMark, buttonStyles, cx } from "@/components/ui";
import { SiteFooter } from "./SiteFooter";

const HEADER_LINKS = [
  { href: "/docs", label: "Docs" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
];

/** Top bar of the marketing pages: the logo, a few links and the way into the app. */
function SiteHeader() {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-paper">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-2 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-ink" aria-label="NimBill home">
          <LogoMark />
          <span className="text-lg font-bold tracking-tighter">NimBill</span>
        </Link>
        <nav aria-label="Site" className="flex min-w-0 items-center gap-0.5 sm:gap-2">
          {HEADER_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="px-2 py-2 text-sm whitespace-nowrap text-muted hover:text-ink sm:px-3">
              {l.label}
            </Link>
          ))}
          {/* The wrapper hides it on phones: the button's own inline-flex would win over `hidden`. */}
          <span className="ml-1 hidden sm:block">
            <Link href="/" className={buttonStyles({ size: "sm", className: "whitespace-nowrap" })}>
              Open NimBill
            </Link>
          </span>
        </nav>
      </div>
    </header>
  );
}

/** Frame of a public marketing page: full width (.bleed), header, content, site footer. */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="bleed flex flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter className="mt-16 sm:mt-24" />
    </div>
  );
}

/** The heading block at the top of a marketing page. */
export function PageHero({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="border-b border-line">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-20">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-3 text-4xl leading-[1.02] font-bold tracking-tighter text-balance sm:text-6xl">{title}</h1>
        {lead && <p className="mt-5 max-w-2xl text-lg text-muted">{lead}</p>}
        {children}
      </div>
    </section>
  );
}

/** A readable text column with styled headings, paragraphs, lists and links. */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6 sm:pt-14",
        "[&_h2]:mt-12 [&_h2]:scroll-mt-24 [&_h2]:border-t [&_h2]:border-ink [&_h2]:pt-4 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight [&>:first-child]:mt-0",
        "[&_h3]:mt-8 [&_h3]:font-semibold",
        "[&_p]:mt-4 [&_p]:leading-relaxed [&_p]:text-ink-soft",
        "[&_ul]:mt-4 [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:leading-relaxed [&_ul]:text-ink-soft [&_ul>li]:list-[square]",
        "[&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_ol]:leading-relaxed [&_ol]:text-ink-soft",
        "[&_a]:text-ink [&_a]:underline [&_a]:decoration-1 [&_a]:underline-offset-4 hover:[&_a]:decoration-2",
        "[&_:not(pre)>code]:bg-subtle [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.9em]",
        "[&_strong]:font-semibold [&_strong]:text-ink",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A multi-line code sample. Scrolls sideways on its own, so the page never does. */
export function Code({ children, label }: { children: string; label?: string }) {
  return (
    <figure className="mt-5 border border-ink">
      {label && (
        <figcaption className="border-b border-ink bg-subtle px-4 py-2 font-mono text-[11px] font-semibold tracking-wider uppercase">
          {label}
        </figcaption>
      )}
      <pre className="overflow-x-auto bg-ink p-4 font-mono text-xs leading-relaxed text-paper">
        <code>{children}</code>
      </pre>
    </figure>
  );
}

/** A boxed note: "draft", "heads up". Sharp, bordered, like the rest of the kit. */
export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-8 border border-ink bg-subtle p-4 sm:p-5">
      <p className="font-mono text-[11px] font-semibold tracking-wider uppercase">{title}</p>
      <div className="mt-2 text-sm text-ink-soft [&_p+p]:mt-2">{children}</div>
    </div>
  );
}
