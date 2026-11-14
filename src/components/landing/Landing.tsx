"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { PayByNumber } from "@/components/PayByNumber";
import { CurrencyLabel } from "@/components/CurrencyIcon";
import {
  Alert,
  Button,
  CoinText,
  Eyebrow,
  Loader,
  LogoMark,
  OpenInNimiqPay,
  TextLink,
  buttonStyles,
  coinText,
  cx,
  withCoins,
} from "@/components/ui";
import { api, type PublicInvoice } from "@/lib/client/api";
import { useInView, useReducedMotion } from "@/lib/client/motion";
import { useNimiq } from "@/lib/client/nimiq";
import { useSignIn } from "@/lib/client/session";
import { CURRENCIES } from "@/lib/currencies";
import { SiteFooter } from "@/components/site/SiteFooter";
import { ReceiptDemo } from "./ReceiptDemo";

/** Inline style that sets the animation / transition delay used by the classes in globals.css. */
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

/** The signed-out home page. */
export function Landing() {
  return (
    <div className="bleed">
      <Nav />
      <Hero />
      <CurrencyTicker />
      <LiveStats />
      <HowItWorks />
      <Verification />
      <Features />
      <PaySection />
      <FinalCall />
      <SiteFooter />
    </div>
  );
}

function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mx-auto w-full max-w-5xl px-4 sm:px-6", className)}>{children}</div>;
}

type NavItem = { href: string; label: string; text: string };

/** Everything worth a visit, grouped for the menu. The first few also sit in the bar on wide screens. */
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Product",
    items: [
      { href: "#how", label: "How it works", text: "Create, share, get paid in about a minute." },
      { href: "/pay", label: "Pay an invoice", text: "Got a Nimbill number? Pay it from any wallet." },
      { href: "/cheques", label: "Cheques", text: "Write a NIM cheque anyone can cash with a link." },
      { href: "/stats", label: "Payments & stats", text: "Every payment, linked to its blockchain transaction." },
    ],
  },
  {
    title: "Developers",
    items: [
      { href: "/docs", label: "Developer docs", text: "Plain HTTP and JSON. No API key, verified on-chain." },
      { href: "/ai", label: "AI assistants", text: "Set up ChatGPT, Claude, Cursor or Grok to pay with NimBill." },
      { href: "/mcp", label: "MCP server", text: "An agent wallet for Claude and other MCP clients." },
    ],
  },
];

/** Shown inline in the bar from md up; the menu always has everything. */
const BAR_LINKS = [
  { href: "#how", label: "How it works" },
  { href: "/stats", label: "Payments" },
  { href: "/docs", label: "Docs" },
  { href: "/ai", label: "AI" },
  { href: "/mcp", label: "MCP" },
];

function NavLink({ href, className, children, onClick }: { href: string; className?: string; children: ReactNode; onClick?: () => void }) {
  // In-page anchors stay plain <a> so the browser scrolls; routes use Link.
  return href.startsWith("#") ? (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  ) : (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}

function Nav() {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLElement>(null);
  const close = () => setOpen(false);

  // Escape or a tap outside the header closes the menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <header ref={root} className="no-print sticky top-0 z-30 border-b border-line bg-paper">
      <Container className="flex h-16 items-center justify-between gap-2">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-ink" aria-label="NimBill home" onClick={close}>
          <LogoMark />
          <span className="text-lg font-bold tracking-tighter">NimBill</span>
        </Link>
        <nav aria-label="Page" className="flex min-w-0 items-center gap-1 sm:gap-2">
          {BAR_LINKS.map((l) => (
            <NavLink key={l.href} href={l.href} className="hidden px-3 py-2 text-sm whitespace-nowrap text-muted hover:text-ink md:block">
              {l.label}
            </NavLink>
          ))}
          <a href="#start" onClick={close} className={buttonStyles({ size: "sm", className: "whitespace-nowrap" })}>
            Get started
          </a>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
            className={cx(
              "flex h-9 shrink-0 items-center gap-2 border px-2.5 font-mono text-[11px] font-semibold tracking-wider uppercase transition-colors",
              open ? "border-ink bg-ink text-paper" : "border-ink text-ink hover:bg-subtle",
            )}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="square"
              aria-hidden
            >
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
            <span className="hidden sm:inline">{open ? "Close" : "Menu"}</span>
          </button>
        </nav>
      </Container>

      {open && (
        <>
          {/* Dims the page under the menu; tapping it closes the menu (via the pointerdown listener). */}
          <div aria-hidden className="fixed inset-x-0 top-16 bottom-0 -z-10 bg-ink/30" />
          <div
            id={menuId}
            className="menu-in absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-ink bg-paper"
          >
            <Container className="grid gap-8 py-6 sm:grid-cols-2 sm:py-8">
              {NAV_GROUPS.map((g) => (
                <div key={g.title}>
                  <Eyebrow>{g.title}</Eyebrow>
                  <ul className="mt-3 border-t border-line">
                    {g.items.map((item) => (
                      <li key={item.href} className="border-b border-line">
                        <NavLink href={item.href} onClick={close} className="group flex items-center justify-between gap-4 py-3">
                          <span className="min-w-0">
                            <span className="block font-semibold">{item.label}</span>
                            <span className="mt-0.5 block text-sm text-muted">
                              <CoinText>{item.text}</CoinText>
                            </span>
                          </span>
                          <span
                            aria-hidden
                            className="shrink-0 text-muted transition-transform group-hover:translate-x-1 group-hover:text-ink"
                          >
                            →
                          </span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Container>
          </div>
        </>
      )}
    </header>
  );
}

/** A heading whose words slide up one after another. */
function Words({ text, start = 0 }: { text: string; start?: number }) {
  return (
    <>
      {text.split(" ").map((word, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <span className="word-in inline-block" style={delay(start + i * 70)}>
            {coinText(word)}
            {" "}
          </span>
        </span>
      ))}
    </>
  );
}

// The badges in the hero's currency stack, in order. Four, so the stack fits on the line after
// "currency." at every width instead of splitting the headline; "+N" counts the rest.
const STACK_CODES = ["NGN", "USD", "EUR", "GHS"] as const;
// Fill styles taking turns, so overlapping neighbours stay easy to tell apart in black and white.
const STACK_TONES = ["bg-ink text-paper", "bg-paper text-ink", "bg-subtle text-ink"];
/** One glyph per badge: GH₵ → ₵, so it fits a circle. */
const glyph = (symbol: string) => (symbol.length > 1 ? symbol.replace(/^[A-Z]+/, "") || symbol : symbol);

/**
 * The currencies you can invoice in, as overlapping round badges, like the avatars of the people
 * in a shared design file. Sized in em, so it scales with the heading it sits in. Decorative: the
 * heading already says it in words, so screen readers skip it.
 */
function CurrencyStack({ start = 0 }: { start?: number }) {
  const shown = STACK_CODES.map((code) => CURRENCIES.find((c) => c.code === code)!);
  return (
    <span aria-hidden className="ml-[0.06em] inline-flex items-center align-[0.06em]">
      {shown.map((c, i) => (
        <span
          key={c.code}
          title={c.name}
          className={cx(
            "stack-in relative flex h-[0.66em] w-[0.66em] shrink-0 items-center justify-center rounded-full border-[0.04em] border-ink",
            "shadow-[0_0_0_0.05em_var(--color-paper)] transition-transform duration-200 hover:z-20 hover:-translate-y-[0.08em]",
            i > 0 && "-ml-[0.18em]",
            STACK_TONES[i % STACK_TONES.length],
          )}
          style={{ ...delay(start + i * 80), zIndex: shown.length - i }}
        >
          <span className="text-[0.38em] leading-none font-bold tracking-normal">{glyph(c.symbol)}</span>
        </span>
      ))}
      {/* "+N" for the rest, like a collaborator count. */}
      <span
        className="stack-in relative -ml-[0.18em] flex h-[0.66em] min-w-[0.66em] shrink-0 items-center justify-center rounded-full border-[0.04em] border-ink bg-paper px-[0.12em] shadow-[0_0_0_0.05em_var(--color-paper)]"
        style={delay(start + shown.length * 80)}
      >
        <span className="font-mono text-[0.28em] leading-none font-semibold tracking-normal">+{CURRENCIES.length - shown.length}</span>
      </span>
    </span>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div aria-hidden className="grid-bg pointer-events-none absolute inset-0" />
      <div aria-hidden className="scan pointer-events-none absolute inset-x-0 top-0 h-px bg-ink/30" />
      <Container className="relative grid items-center gap-12 pt-12 pb-16 sm:pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-10 lg:pt-24 lg:pb-24">
        <div>
          <p
            className="fade-up inline-flex items-center gap-2 border border-ink bg-paper px-2.5 py-1 font-mono text-[11px] font-medium tracking-wider uppercase"
            style={delay(0)}
          >
            <span aria-hidden className="blink h-2 w-2 bg-ink" />A Nimiq Pay Mini App
          </p>
          <h1 className="mt-6 text-[2.6rem] leading-[0.98] font-bold tracking-tighter sm:text-6xl lg:text-[4.25rem]">
            <Words text="Invoice in your" start={100} />
            {/* "currency." and its stack wrap together, so the stack never ends up on a line of its own. */}
            <span className="whitespace-nowrap">
              <Words text="currency." start={310} />
              <CurrencyStack start={420} />
            </span>
            <br />
            <span className="text-muted">
              <Words text="Get paid in NIM or USDT." start={420} />
            </span>
          </h1>
          <p className="fade-up mt-6 max-w-md text-base text-muted sm:text-lg" style={delay(800)}>
            For freelancers and small businesses. Send one link. Your client pays from their wallet, straight into yours, and we check it on
            the blockchain.
          </p>
          <div id="start" className="fade-up mt-8 max-w-md scroll-mt-24" style={delay(950)}>
            <CallToAction />
          </div>
          <ul className="fade-up mt-6 flex flex-wrap gap-2" style={delay(1100)}>
            {["No account for clients", "Wallet to wallet", `${CURRENCIES.length} currencies`].map((t) => (
              <li key={t} className="border border-line bg-paper px-2 py-1 font-mono text-[11px] text-muted">
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="fade-up px-4 sm:px-10 lg:px-0" style={delay(500)}>
          <ReceiptDemo />
        </div>
      </Container>
    </section>
  );
}

function TryDemo() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="secondary"
        block
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const { invoice } = await api<{ invoice: PublicInvoice }>("/api/demo", { method: "POST" });
            router.push(`/i/${invoice.id}`);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        Try it: pay a sample invoice (≈ $0.05)
      </Button>
      {error && <Alert kind="error">{error}</Alert>}
    </>
  );
}

function CallToAction() {
  const { state } = useNimiq();
  const { signIn, busy, error } = useSignIn();
  return (
    <div className="space-y-3">
      {state === "checking" ? (
        <Loader compact />
      ) : state === "ready" ? (
        <>
          <Button size="lg" block loading={busy} onClick={signIn} className="group">
            Start invoicing — sign in with Nimiq Pay
            <span aria-hidden className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </Button>
          <p className="text-center text-xs text-muted">Signing a message proves the wallet is yours. It costs nothing.</p>
          {error && <Alert kind="error">{error}</Alert>}
        </>
      ) : (
        <OpenInNimiqPay text="NimBill is a Nimiq Pay Mini App. Open it in Nimiq Pay to create invoices and pay them." />
      )}
      <TryDemo />
    </div>
  );
}

/** A black band of the currencies you can bill in, scrolling sideways. */
function CurrencyTicker() {
  const items = CURRENCIES.map((c) => `${c.symbol} ${c.code}`);
  const row = (hidden?: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0">
      {items.map((t) => (
        <li key={t} className="flex items-center gap-6 pr-6 font-mono text-sm tracking-wider whitespace-nowrap">
          {t}
          <span aria-hidden className="h-1.5 w-1.5 bg-paper/40" />
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-label={`Bill in ${CURRENCIES.length} currencies`} className="overflow-hidden border-b border-ink bg-ink py-4 text-paper">
      <div className="marquee flex w-max">
        {row()}
        {row(true)}
      </div>
    </section>
  );
}

/** Fades and lifts its content in when it scrolls into view. */
function Reveal({ children, delayMs = 0, className }: { children: ReactNode; delayMs?: number; className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.15);
  return (
    <div ref={ref} data-in={inView || undefined} style={delay(delayMs)} className={cx("reveal", className)}>
      {children}
    </div>
  );
}

function CountUp({ value }: { value: number }) {
  const [ref, inView] = useInView<HTMLSpanElement>(0.5);
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView || reduced) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1400);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, value, reduced]);
  return (
    <span ref={ref} className="tabular-nums">
      {(reduced ? value : shown).toLocaleString("en-US")}
    </span>
  );
}

type StatsResponse = { invoicesCreated: number; groups: { count: number }[] };

function LiveStats() {
  const [stats, setStats] = useState<{ paid: number; created: number } | null>(null);
  useEffect(() => {
    let alive = true;
    api<StatsResponse>("/api/stats")
      .then((s) => alive && setStats({ paid: s.groups.reduce((n, g) => n + g.count, 0), created: s.invoicesCreated }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const cells: { label: string; value: ReactNode }[] = [
    { label: "Payments verified on-chain", value: stats ? <CountUp value={stats.paid} /> : "—" },
    { label: "Invoices created", value: stats ? <CountUp value={stats.created} /> : "—" },
    { label: "Currencies", value: <CountUp value={CURRENCIES.length} /> },
    { label: "Rate lock", value: "5 min" },
  ];

  return (
    <section className="border-b border-line">
      <Container className="py-10 sm:py-14">
        <Reveal>
          <div className="grid grid-cols-2 border border-ink lg:grid-cols-4">
            {cells.map((c, i) => (
              <div
                key={c.label}
                className={cx(
                  "p-4 sm:p-6",
                  i % 2 === 1 && "border-l border-line",
                  i >= 2 && "border-t border-line lg:border-t-0",
                  i === 2 && "lg:border-l",
                )}
              >
                <Eyebrow>{c.label}</Eyebrow>
                <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{c.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-right text-sm">
            <TextLink href="/stats" muted>
              See every payment →
            </TextLink>
          </p>
        </Reveal>
      </Container>
    </section>
  );
}

function SectionHead({ index, label, title, text }: { index: string; label: string; title: ReactNode; text?: ReactNode }) {
  return (
    <Reveal className="max-w-2xl">
      <Eyebrow>
        {index} / {label}
      </Eyebrow>
      <h2 className="mt-3 text-3xl leading-[1.02] font-bold tracking-tighter sm:text-5xl">{withCoins(title)}</h2>
      {text && <p className="mt-4 text-muted sm:text-lg">{withCoins(text)}</p>}
    </Reveal>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Create",
    text: "Add line items in Naira, Shillings, Euros or any of 16 more currencies. Set a due date and a note.",
    visual: (
      <ul className="space-y-1 font-mono text-[11px]">
        <li className="flex justify-between border-b border-line pb-1">
          <span>Logo design</span>
          <span>₦120,000</span>
        </li>
        <li className="flex justify-between border-b border-line pb-1">
          <span>Brand guidelines</span>
          <span>₦45,000</span>
        </li>
        <li className="flex justify-between font-semibold">
          <span>TOTAL</span>
          <span>₦165,000</span>
        </li>
      </ul>
    ),
  },
  {
    n: "02",
    title: "Share",
    text: "Send one link or a short Nimbill number over WhatsApp, or show a QR code in person.",
    visual: (
      <div className="space-y-1.5 font-mono text-[11px]">
        <p className="truncate border border-line bg-subtle px-2 py-1">…/i/k7m2p9qx4z</p>
        <p className="border border-ink px-2 py-1 font-semibold tracking-wider">NMN-K7M2P-9QX4Z</p>
      </div>
    ),
  },
  {
    n: "03",
    title: "Get paid",
    text: "Your client pays in NIM or USDT at a live rate locked for 5 minutes. It's marked paid once it's on the blockchain.",
    visual: (
      <div className="flex items-center justify-between border border-ink bg-ink px-2 py-1.5 font-mono text-[11px] text-paper">
        <span>INV-0042</span>
        <span className="font-semibold">✓ PAID</span>
      </div>
    ),
  },
];

function HowItWorks() {
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  return (
    <section id="how" className="scroll-mt-16 border-b border-line">
      <Container className="py-16 sm:py-24">
        <SectionHead index="01" label="How it works" title="Three steps. About a minute." />
        <div ref={ref} data-in={inView || undefined} className="relative mt-10 sm:mt-14">
          <div aria-hidden className="draw-x absolute inset-x-0 top-0 hidden h-px bg-ink lg:block" />
          <ol className="grid gap-4 lg:grid-cols-3 lg:gap-0">
            {STEPS.map((step, i) => (
              <li
                key={step.n}
                className="reveal border border-ink p-5 lg:border-t-0 lg:pt-8 lg:not-first:border-l-0"
                style={delay(200 + i * 180)}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-4xl font-bold tracking-tighter">{step.n}</span>
                  <span className="font-mono text-[11px] tracking-wider text-muted uppercase">Step {i + 1} of 3</span>
                </div>
                <h3 className="mt-4 text-xl font-bold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted">
                  <CoinText>{step.text}</CoinText>
                </p>
                <div className="mt-5">{step.visual}</div>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}

const CHECKS = [
  ["Included in a block", "confirmed"],
  ["Pays the merchant's address", "NQ42 8K3M … 7Q2F"],
  ["Carries the invoice reference", "NimBill k7m2p9qx4z"],
  ["Amount covers the quote", "92,500.00 NIM"],
  ["Sent before the quote expired", "4:12 left"],
  ["Hash never used before", "unique"],
];

function Verification() {
  const [ref, inView] = useInView<HTMLDivElement>(0.35);
  return (
    <section className="border-b border-line bg-subtle">
      <Container className="grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-2">
        <SectionHead
          index="02"
          label="Verification"
          title="Paid means paid."
          text="A transaction hash from the browser is never trusted on its own. The server reads the payment from the blockchain and checks all of this before an invoice is marked paid."
        />
        <div ref={ref} data-in={inView || undefined} className="reveal border border-ink bg-paper" style={delay(150)}>
          <div className="flex items-center justify-between border-b border-ink px-4 py-3">
            <div>
              <p className="font-mono text-[10px] tracking-wider text-muted uppercase">Transaction</p>
              <p className="font-mono text-sm font-semibold">8f3c…a91e</p>
            </div>
            <span className="inline-flex items-center gap-1.5 border border-ink px-2 py-0.5 font-mono text-[11px] font-semibold">
              <span aria-hidden className="blink h-1.5 w-1.5 bg-ink" />
              LIVE CHECK
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-subtle text-left font-mono text-[10px] tracking-wider text-muted uppercase">
                <th className="px-4 py-2 font-normal">Check</th>
                <th className="px-4 py-2 text-right font-normal">Result</th>
              </tr>
            </thead>
            <tbody>
              {CHECKS.map(([check, result], i) => (
                <tr key={check} className="check border-b border-line last:border-b-0" style={delay(300 + i * 280)}>
                  <td className="px-4 py-2.5">{check}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    <span className="inline-grid">
                      <span className="pending col-start-1 row-start-1 text-muted">checking…</span>
                      <span className="ok col-start-1 row-start-1 font-semibold">
                        <CoinText>✓ {result}</CoinText>
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-2 border-t border-ink px-4 py-3">
            {["Nimiq RPC", "Polygon · 5 confirmations", "No middleman"].map((t) => (
              <span key={t} className="border border-line px-2 py-0.5 font-mono text-[11px] text-muted">
                {t}
              </span>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

function Features() {
  const [ref, inView] = useInView<HTMLDivElement>(0.25);
  const card = "group border border-ink p-6 transition-colors duration-300 hover:bg-ink hover:text-paper";
  const sub = "mt-1 text-sm text-muted transition-colors duration-300 group-hover:text-paper/70";
  const glyph = "flex h-11 w-11 items-center justify-center border border-current font-mono text-lg font-bold";
  return (
    <section className="border-b border-line">
      <Container className="py-16 sm:py-24">
        <SectionHead index="03" label="Built for freelancers" title="Everything after you hit send." />
        <div ref={ref} data-in={inView || undefined} className="mt-10 grid gap-4 sm:mt-14 sm:grid-cols-2">
          <div className={cx(card, "reveal flex flex-col sm:row-span-2")} style={delay(0)}>
            <span aria-hidden className={glyph}>
              ₦
            </span>
            <h3 className="mt-5 text-2xl font-bold tracking-tight">Price in your currency</h3>
            <p className={sub}>The total is converted at the live rate and rounded up, so you never get less than you invoiced.</p>
            <div className="my-8 flex flex-1 flex-col justify-center font-mono">
              <p className="text-3xl font-bold tracking-tight sm:text-4xl">₦185,000</p>
              <p className="my-2 flex items-center gap-2 text-[11px] tracking-wider uppercase opacity-60">
                <span aria-hidden className="h-px w-8 bg-current" />
                live rate · rounded up
              </p>
              <p className="text-3xl font-bold tracking-tight sm:text-4xl">
                <CoinText>92,500.00 NIM</CoinText>
              </p>
            </div>
            <div className="grid grid-cols-3 gap-1 font-mono text-[11px]">
              {CURRENCIES.slice(0, 12).map((c) => (
                <span key={c.code} className="flex justify-center border border-current/30 px-1.5 py-1">
                  <CurrencyLabel code={c.code} />
                </span>
              ))}
            </div>
          </div>
          <div className={cx(card, "reveal")} style={delay(120)}>
            <span aria-hidden className={glyph}>
              ≡
            </span>
            <h3 className="mt-5 text-xl font-bold">Receipts for your accountant</h3>
            <p className={sub}>The rate used, both addresses and a link to the transaction. Download it as a PDF.</p>
          </div>
          <div className={cx(card, "reveal")} style={delay(240)}>
            <span aria-hidden className={glyph}>
              %
            </span>
            <h3 className="mt-5 text-xl font-bold">Grow what you earn</h3>
            <p className={sub}>
              <CoinText>Stake your NIM earnings with a top-rated pool in one tap, right after you get paid.</CoinText>
            </p>
            <div aria-hidden className="mt-5 flex h-12 items-end gap-1">
              {[22, 30, 38, 46, 58, 70, 84, 100].map((h, i) => (
                <span key={i} className="grow-y flex-1 bg-current" style={{ height: `${h}%`, ...delay(400 + i * 70) }} />
              ))}
            </div>
          </div>
          <div
            className={cx(card, "reveal flex flex-col gap-4 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between")}
            style={delay(360)}
          >
            <div>
              <span aria-hidden className={glyph}>
                @
              </span>
              <h3 className="mt-5 text-xl font-bold">Know the moment you&apos;re paid</h3>
              <p className={sub}>Add an email in Settings and NimBill emails you once, when an invoice is paid.</p>
            </div>
            <p className="shrink-0 border border-current px-3 py-2 font-mono text-xs">INV-0042 was paid · ₦185,000</p>
          </div>
        </div>
      </Container>
    </section>
  );
}

function PaySection() {
  return (
    <section className="border-b border-line bg-subtle">
      <Container className="grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-2">
        <SectionHead
          index="04"
          label="Paying someone?"
          title="Got a Nimbill number?"
          text="No account needed. Paste the number you were sent to see the invoice and pay it from any Nimiq wallet."
        />
        <Reveal delayMs={150}>
          <PayByNumber />
        </Reveal>
      </Container>
    </section>
  );
}

function FinalCall() {
  return (
    <section className="relative overflow-hidden border-b border-ink bg-ink text-paper">
      <div aria-hidden className="grid-bg-dark pointer-events-none absolute inset-0" />
      <Container className="relative py-20 text-center sm:py-28">
        <Reveal>
          {/* The mark's "N" is drawn in paper colour, so it sits on a white tile here. */}
          <span className="inline-flex bg-paper p-2 text-ink">
            <LogoMark size={40} />
          </span>
          <h2 className="mx-auto mt-6 max-w-2xl text-4xl leading-[1.02] font-bold tracking-tighter sm:text-6xl">
            Your next invoice could be paid in a minute.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-paper/70">Free to use. Your money never passes through us.</p>
          <a href="#start" className={buttonStyles({ variant: "secondary", size: "lg", className: "mt-8 border-paper" })}>
            Start invoicing ↑
          </a>
        </Reveal>
      </Container>
    </section>
  );
}
