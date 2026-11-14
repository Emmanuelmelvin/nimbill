import type { Metadata } from "next";
import Link from "next/link";
import { Notice, PageHero, Prose } from "@/components/site/SiteShell";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Terms",
  ogTitle: "NimBill terms of use",
  description: "The terms for using NimBill, in plain words: a non-custodial tool for invoices paid in NIM and USDT.",
  path: "/terms",
});

const UPDATED = "14 November 2026";

export default function TermsPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Terms of use" lead="The short version, in plain words.">
        <p className="mt-4 font-mono text-[11px] tracking-wider text-muted uppercase">Last updated {UPDATED}</p>
        <Notice title="Draft">
          <p>
            These terms are a draft. They describe how NimBill works today and have not been reviewed by a lawyer. The owner still has to
            confirm them and add the governing law and a contact address before relying on them.
          </p>
        </Notice>
      </PageHero>

      <Prose>
        <h2 id="what">What NimBill does</h2>
        <p>
          NimBill is a tool for creating invoices, price quotes and pay boards, and for checking the Nimiq and Polygon blockchains for the
          payments that settle them. NimBill is non-custodial: it never holds, sends or receives money for you. Payments go directly between
          wallets that you and your clients control.
        </p>

        <h2 id="wallet">Your wallet, your responsibility</h2>
        <ul>
          <li>You keep control of your wallet and its keys. NimBill can&apos;t recover a lost wallet or access your funds.</li>
          <li>
            Blockchain payments are final. NimBill can&apos;t reverse, refund or cancel a payment once it is sent. Refunds are up to the
            merchant.
          </li>
          <li>Check the address, the amount and the network before you send.</li>
        </ul>

        <h2 id="prices">Prices and rates</h2>
        <p>
          Coin prices come from an outside price feed and are locked for a few minutes on each quote. They can differ from prices on
          exchanges. NimBill does not give financial advice and does not exchange currencies.
        </p>

        <h2 id="use">Using NimBill fairly</h2>
        <ul>
          <li>Use NimBill only for lawful goods and services, and only to bill for real work or sales.</li>
          <li>Don&apos;t impersonate others, claim a tag to mislead people, or use NimBill to defraud payers.</li>
          <li>Don&apos;t try to break, overload or get around the limits of the service or its API.</li>
          <li>You are responsible for what you put on your invoices and pay board, and for any taxes on what you earn.</li>
        </ul>
        <p>
          Tags and boards that break these rules may be removed. A tag you give up is held for a while so nobody else can receive payments
          meant for you.
        </p>

        <h2 id="developers">Stores, programs and AI agents</h2>
        <p>
          The <Link href="/docs">API</Link> is open and needs no key. If you connect a store with{" "}
          <Link href="/docs/webhooks">Pay with NimBill</Link>, keep your webhook secret private: anyone who has it can create signed
          invoices for your board. If you give an AI agent its own wallet through the <Link href="/mcp">MCP server</Link>, you are
          responsible for the payments it makes and the limits you set.
        </p>

        <h2 id="warranty">No warranty</h2>
        <p>
          NimBill is provided as it is, without warranties. It may change, have downtime or have bugs. To the extent the law allows, NimBill
          and its maintainer are not liable for lost funds, missed payments or other losses that come from using it.
        </p>

        <h2 id="changes">Changes</h2>
        <p>
          These terms may change as NimBill changes. The date at the top shows the latest version. Your data is handled as described in the{" "}
          <Link href="/privacy">privacy policy</Link>.
        </p>

        <h2 id="contact">Contact</h2>
        <p>
          Questions: send a message to <a href="https://x.com/mercichidi">@mercichidi on X</a>.
        </p>
      </Prose>
    </>
  );
}
