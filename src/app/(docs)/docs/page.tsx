import type { Metadata } from "next";
import { headers } from "next/headers";
import { LogoStrip } from "@/components/docs/AiParts";
import { Card, Cards, DocPage, H2, Tile } from "@/components/docs/DocsParts";
import { LinkButton, cx } from "@/components/ui";
import { requestOrigin } from "@/lib/request-origin";

export const metadata: Metadata = {
  title: "Introduction",
  description: "Let people, programs and AI agents pay you in NIM or USDT. Plain HTTP and JSON, no API key, verified on-chain.",
};

/** The developer docs' front page: what the API is for and where to go next. */
export default async function Introduction() {
  const base = requestOrigin(await headers());
  const example = `${base}/pay/ada`;

  return (
    <DocPage title="Get paid by people, programs and AI agents.">
      <p className="text-muted sm:text-lg">
        Every NimBill user has a tag like <span className="font-mono text-ink">ada@nimbill</span> and a public board at{" "}
        <span className="font-mono break-all text-ink">{example}</span>. Anything that can send an HTTP request can pay it: a shop, a bot,
        a script or an AI assistant. Plain JSON, no API key, and the money goes straight from wallet to wallet.
      </p>
      <div className="flex flex-wrap gap-3">
        <LinkButton href="/docs/quick-start" size="md">
          Quick start
        </LinkButton>
        <LinkButton href="/ai" variant="secondary" size="md">
          Set up your AI
        </LinkButton>
        <LinkButton href="/mcp" variant="secondary" size="md">
          MCP Agent Wallet →
        </LinkButton>
      </div>
      <ul className="flex flex-wrap gap-2 font-mono text-[11px]">
        {[
          ["/mcp", "/mcp"],
          ["/llms.txt", "llms.txt"],
          ["/openapi.json", "openapi.json"],
          ["/skill.md", "skill.md"],
        ].map(([href, label]) => (
          <li key={href}>
            <a href={href} className="inline-block border border-line px-2 py-1 text-muted transition-colors hover:border-ink hover:text-ink">
              {label}
            </a>
          </li>
        ))}
      </ul>

      <H2 id="works-with">Works with</H2>
      <LogoStrip title="Works with" footnote="…and any agent or program that can make HTTP requests. Logos belong to their owners." />

      <H2 id="why">Why use it</H2>
      <p className="text-muted">
        <span className="font-semibold text-ink">One link to get paid. One API to pay.</span> A NimBill board already lets people pay you
        from a browser. The API opens the same board to software, so payments can happen inside the tools people already use.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Tile icon="₦" title="Checkout for your shop or app">
          Price in Naira, Shillings, Euros or 16 more currencies. Create an invoice when a customer checks out, show them the invoice link,
          and mark the order paid when NimBill confirms it on-chain.
        </Tile>
        <Tile icon="#" title="Bots that take payments">
          A Telegram, Discord or WhatsApp bot can sell a ticket, a file or an hour of your time: create the invoice, send the link, check
          the status. No payment provider to sign up for.
        </Tile>
        <Tile icon="✦" title="AI assistants that pay for people">
          Ask ChatGPT, Claude or Grok to “pay ada@nimbill for the logo pack”. The assistant reads the board, makes the invoice and hands you
          a link to approve in your wallet.
        </Tile>
        <Tile icon="⚙" title="Agents and scripts that pay on their own">
          An agent with its own wallet can buy from a board end to end (invoice, price lock, payment and confirmation) within the limits you
          give it.
        </Tile>
      </div>

      <H2 id="no-setup">What you don&apos;t need</H2>
      <ul className="grid border border-ink text-sm sm:grid-cols-2">
        {[
          ["No API key or account", "Every endpoint here is public. The payer never signs up."],
          ["No custody", "Money goes from the payer's wallet to the merchant's. NimBill only reads the blockchain."],
          ["No webhooks to host", "Ask the invoice for its status; NimBill also finds payments sent without a verify call."],
          ["No currency maths", "Prices are in local currency. The quote turns them into exact coin amounts."],
        ].map(([t, d], i) => (
          <li
            key={t}
            className={cx("p-4", i > 0 && "border-t border-line", i === 1 && "sm:border-t-0 sm:border-l", i === 3 && "sm:border-l")}
          >
            <p className="font-semibold">✓ {t}</p>
            <p className="mt-0.5 text-muted">{d}</p>
          </li>
        ))}
      </ul>

      <H2 id="next">Where to go next</H2>
      <Cards>
        <Card href="/docs/quick-start" title="Quick start" icon="▶">
          Buy a product from a board with five requests.
        </Card>
        <Card href="/docs/how-it-works" title="How payments work" icon="⇄">
          Read, invoice, quote, send, verify.
        </Card>
        <Card href="/docs/api" title="Board API" icon="{}">
          Every public endpoint, with examples.
        </Card>
        <Card href="/ai" title="AI assistants" icon="✦">
          Teach Claude, ChatGPT, Cursor or Grok to pay with NimBill.
        </Card>
      </Cards>
    </DocPage>
  );
}
