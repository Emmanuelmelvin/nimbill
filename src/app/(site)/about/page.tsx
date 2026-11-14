import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Prose } from "@/components/site/SiteShell";
import { CoinText, LinkButton, cx } from "@/components/ui";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "About",
  ogTitle: "About NimBill",
  description:
    "NimBill is a Nimiq Pay mini app for invoices and public pay boards, paid in NIM or USDT. Non-custodial: every payment goes wallet to wallet and is verified on-chain.",
  path: "/about",
});

const PRINCIPLES = [
  {
    title: "Wallet to wallet",
    text: "Payments go straight from the payer's wallet to yours. NimBill never holds, moves or can freeze your money.",
  },
  {
    title: "Verified on-chain",
    text: "An invoice is marked paid only after NimBill reads the transaction from the blockchain and checks the recipient, amount and memo.",
  },
  {
    title: "Your currency",
    text: "Price work in Naira, Shillings, Euros and more. The client pays in NIM or USDT at a live rate locked for 5 minutes.",
  },
  {
    title: "Open to programs",
    text: "Plain HTTP and JSON with no API key, an OpenAPI spec, and an MCP server, so stores and AI agents can pay too.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About"
        title="Invoices and pay boards, paid wallet to wallet."
        lead={
          <CoinText>
            NimBill lets freelancers and small businesses bill in their own currency and get paid in NIM or USDT, straight to their Nimiq
            Pay wallet.
          </CoinText>
        }
      />

      <section className="border-b border-line">
        <ul className="mx-auto grid w-full max-w-5xl sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map((p, i) => (
            <li
              key={p.title}
              className={cx(
                "border-line px-4 py-8 sm:px-6",
                i > 0 && "border-t sm:border-t-0",
                i % 2 === 1 && "sm:border-l",
                i >= 2 && "sm:border-t lg:border-t-0",
                i === 2 && "lg:border-l",
              )}
            >
              <span className="font-mono text-[11px] text-muted">{String(i + 1).padStart(2, "0")}</span>
              <p className="mt-2 font-bold">{p.title}</p>
              <p className="mt-2 text-sm text-muted">
                <CoinText>{p.text}</CoinText>
              </p>
            </li>
          ))}
        </ul>
      </section>

      <Prose>
        <h2 id="what">What NimBill is</h2>
        <p>
          NimBill is a mini app for <a href="https://nimiq.com/nimiq-pay">Nimiq Pay</a>. You sign in with your wallet, add line items in
          your currency and share a link, a short Nimbill number or a QR code. Your client opens it, sees the price in NIM or USDT and pays
          from their own wallet in a few taps. No account is needed to pay.
        </p>
        <p>
          Every merchant also gets a public tag, like <code>ada@nimbill</code>, and a pay board at <code>/pay/ada</code>: a page with your
          name, your products and, if you allow it, a way to pay any amount. Visitors, online stores and AI agents can create invoices on
          it. Stores that <Link href="/docs/webhooks">Pay with NimBill</Link> sign the invoices they create and get a webhook when one is
          paid.
        </p>
        <p>
          Around that sit a few smaller tools: earnings goals, NIM cheques anyone can cash with a link, transfers to other NimBill users by
          tag, and a public <Link href="/stats">stats page</Link> where every payment links to its blockchain transaction.
        </p>

        <h2 id="non-custodial">Why non-custodial</h2>
        <p>
          NimBill never takes custody of funds. It creates invoices and price quotes, and then checks the blockchain for the payment. The
          money itself moves between wallets the payer and the merchant control. That keeps NimBill simple and means there is no balance
          here to lose, freeze or withdraw.
        </p>
        <p>
          The trade-off is that payments are final. A blockchain transaction can&apos;t be reversed by NimBill, so refunds are sent by the
          merchant, like any other payment.
        </p>

        <h2 id="who">Who builds it</h2>
        <p>
          NimBill is built and maintained by <a href="https://x.com/mercichidi">mercichidi</a>. It started as an entry to the{" "}
          <a href="https://miniappscompetition.com/cycle3">Nimiq Mini Apps Competition, Cycle III</a>, in the Pay category, and the code is
          MIT licensed.
        </p>
        <p>
          Questions, ideas or a bug to report? Send a message to <a href="https://x.com/mercichidi">@mercichidi on X</a>, or read the{" "}
          <Link href="/blog">blog</Link> for what&apos;s new.
        </p>
      </Prose>

      <div className="mx-auto mt-12 flex w-full max-w-3xl flex-wrap gap-3 px-4 sm:px-6">
        <LinkButton href="/">Open NimBill</LinkButton>
        <LinkButton href="/docs" variant="secondary">
          Read the docs
        </LinkButton>
      </div>
    </>
  );
}
