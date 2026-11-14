import Link from "next/link";
import { CoinText, LogoMark, cx } from "@/components/ui";

type FooterLink = { href: string; label: string; external?: boolean };

/** The columns of the site footer. Plain files (llms.txt, openapi.json) open as they are, so they use <a>. */
const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/#how", label: "Invoices & pay boards" },
      { href: "/pay", label: "Pay an invoice" },
      { href: "/docs/webhooks", label: "Pay with NimBill" },
      { href: "/cheques", label: "Cheques" },
      { href: "/stats", label: "Stats" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/docs", label: "Docs" },
      { href: "/docs/api", label: "API reference" },
      { href: "/ai", label: "AI assistants" },
      { href: "/mcp", label: "MCP server" },
      { href: "/llms.txt", label: "llms.txt", external: true },
      { href: "/openapi.json", label: "openapi.json", external: true },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/blog", label: "Blog" },
      { href: "https://nimiq.com/nimiq-pay", label: "Get Nimiq Pay", external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

const LINK = "text-sm text-muted transition-colors hover:text-ink hover:underline hover:underline-offset-4";

function FooterAnchor({ link, className }: { link: FooterLink; className?: string }) {
  const offSite = link.href.startsWith("http");
  return link.external ? (
    <a href={link.href} className={cx(LINK, className)} {...(offSite ? { target: "_blank", rel: "noreferrer" } : {})}>
      {link.label}
      {offSite && <span aria-hidden> ↗</span>}
    </a>
  ) : (
    <Link href={link.href} className={cx(LINK, className)}>
      {link.label}
    </Link>
  );
}

/**
 * The footer of the landing page and the public marketing pages (about, blog, privacy, terms).
 * Not shown in the signed-in app screens. Full width: put it inside a `.bleed` page.
 */
export function SiteFooter({ className }: { className?: string }) {
  const year = new Date().getFullYear();
  return (
    <footer className={cx("no-print border-t border-ink bg-paper", className)}>
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        <div className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[1.4fr_3fr] lg:gap-16">
          <div className="max-w-xs">
            <Link href="/" className="inline-flex items-center gap-2 text-ink" aria-label="NimBill home">
              <LogoMark size={26} />
              <span className="text-lg font-bold tracking-tighter">NimBill</span>
            </Link>
            <p className="mt-3 text-sm text-muted">
              <CoinText>Invoices and pay boards paid in NIM and USDT. Wallet to wallet, verified on-chain.</CoinText>
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            {COLUMNS.map((col) => (
              <div key={col.title} className="min-w-0">
                <h2 className="font-mono text-[11px] font-semibold tracking-wider text-ink uppercase">{col.title}</h2>
                <ul className="mt-4 space-y-3">
                  {col.links.map((l) => (
                    <li key={l.href} className="break-words">
                      <FooterAnchor link={l} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-3 border-t border-line py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} NimBill. Non-custodial: your money never passes through us.</p>
          <p>
            Built by{" "}
            <a
              href="https://x.com/mercichidi"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-ink underline decoration-1 underline-offset-4 hover:decoration-2"
            >
              mercichidi
            </a>{" "}
            on X
          </p>
        </div>
      </div>
    </footer>
  );
}
