import { headers } from "next/headers";
import Link from "next/link";
import { AI_LOGOS, AiLogo } from "@/components/AiLogos";
import { CoinIcon } from "@/components/CoinIcon";
import { Code, Fields, MethodBadge, Section, Tile } from "@/components/docs/DocsParts";
import { Eyebrow, Header, LinkButton, TextLink, buttonStyles, cx } from "@/components/ui";
import { AGENT_RULES } from "@/lib/agent-docs";
import { ENDPOINTS, chatInstructions, cursorRule, skillMarkdown } from "@/lib/api-reference";
import { requestOrigin } from "@/lib/request-origin";

const TOC = [
  ["why", "Why use it"],
  ["how", "How it works"],
  ["two-ways", "Two ways to pay"],
  ["quick-start", "Quick start"],
  ["sending", "Sending the payment"],
  ["reference", "API reference"],
  ["setup", "Set up your AI"],
  ["safety", "Safety and limits"],
] as const;

const json = (v: unknown) => JSON.stringify(v, null, 2);
const logo = (key: string) => AI_LOGOS.find((l) => l.key === key)!;

/** The NimBill API: why to use it, how it works, every endpoint, and copy-paste setups for AI tools. */
export default async function Docs() {
  const base = requestOrigin(await headers());
  const example = `${base}/pay/ada`;

  return (
    <div className="bleed">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <Header back="/" />

        {/* ── Hero ───────────────────────────────────────────── */}
        <div className="pb-10">
          <Eyebrow>NimBill API</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-4xl leading-[1.02] font-bold tracking-tighter sm:text-6xl">
            Get paid by people, programs and AI agents.
          </h1>
          <p className="mt-4 max-w-2xl text-muted sm:text-lg">
            Every NimBill user has a tag like <span className="font-mono text-ink">ada@nimbill</span> and a public board at{" "}
            <span className="font-mono break-all text-ink">{example}</span>. Anything that can send an HTTP request can pay it: a shop, a
            bot, a script or an AI assistant. Plain JSON, no API key, and the money goes straight from wallet to wallet.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#quick-start" className={buttonStyles({ size: "md" })}>
              Quick start
            </a>
            <a href="#setup" className={buttonStyles({ variant: "secondary", size: "md" })}>
              Set up your AI
            </a>
            <LinkButton href="/mcp" variant="secondary" size="md">
              MCP Agent Wallet →
            </LinkButton>
          </div>
          <ul className="mt-5 flex flex-wrap gap-2 font-mono text-[11px]">
            {[
              ["/mcp", "/mcp"],
              ["/llms.txt", "llms.txt"],
              ["/openapi.json", "openapi.json"],
              ["/skill.md", "skill.md"],
            ].map(([href, label]) => (
              <li key={href}>
                <a
                  href={href}
                  className="inline-block border border-line px-2 py-1 text-muted transition-colors hover:border-ink hover:text-ink"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>

          <div className="mt-10 border border-ink">
            <p className="border-b border-ink bg-subtle px-4 py-2 font-mono text-[11px] tracking-wider text-muted uppercase">Works with</p>
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
            <p className="border-t border-line px-4 py-2 text-xs text-muted">
              …and any agent or program that can make HTTP requests. Logos belong to their owners.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-10 pb-20 lg:grid-cols-[12rem_minmax(0,1fr)]">
          {/* ── Contents ─────────────────────────────────────── */}
          <nav aria-label="On this page" className="lg:sticky lg:top-6 lg:self-start">
            <Eyebrow className="mb-2">On this page</Eyebrow>
            <ol className="flex flex-wrap gap-2 lg:flex-col lg:gap-0">
              {TOC.map(([id, label], i) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="flex items-baseline gap-2 border border-line px-2 py-1 text-sm text-muted transition-colors hover:text-ink lg:border-0 lg:border-l lg:px-3 lg:py-1.5 lg:hover:border-ink"
                  >
                    <span className="font-mono text-[10px]">{String(i + 1).padStart(2, "0")}</span>
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="min-w-0 space-y-14">
            {/* ── 01 Why ──────────────────────────────────────── */}
            <Section
              id="why"
              index="01"
              label="Why use it"
              title="One link to get paid. One API to pay."
              intro="A NimBill board already lets people pay you from a browser. The API opens the same board to software, so payments can happen inside the tools people already use."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Tile icon="₦" title="Checkout for your shop or app">
                  Price in Naira, Shillings, Euros or 16 more currencies. Create an invoice when a customer checks out, show them the
                  invoice link, and mark the order paid when NimBill confirms it on-chain.
                </Tile>
                <Tile icon="#" title="Bots that take payments">
                  A Telegram, Discord or WhatsApp bot can sell a ticket, a file or an hour of your time: create the invoice, send the link,
                  check the status. No payment provider to sign up for.
                </Tile>
                <Tile icon="✦" title="AI assistants that pay for people">
                  Ask ChatGPT, Claude or Grok to “pay ada@nimbill for the logo pack”. The assistant reads the board, makes the invoice and
                  hands you a link to approve in your wallet.
                </Tile>
                <Tile icon="⚙" title="Agents and scripts that pay on their own">
                  An agent with its own wallet can buy from a board end to end (invoice, price lock, payment and confirmation) within the
                  limits you give it.
                </Tile>
              </div>
              <div className="mt-6 border border-ink">
                <p className="border-b border-ink bg-subtle px-4 py-2 font-mono text-[11px] tracking-wider text-muted uppercase">
                  What you don&apos;t need
                </p>
                <ul className="grid text-sm sm:grid-cols-2">
                  {[
                    ["No API key or account", "Every endpoint here is public. The payer never signs up."],
                    ["No custody", "Money goes from the payer's wallet to the merchant's. NimBill only reads the blockchain."],
                    ["No webhooks to host", "Ask the invoice for its status; NimBill also finds payments sent without a verify call."],
                    ["No currency maths", "Prices are in local currency. The quote turns them into exact coin amounts."],
                  ].map(([t, d], i) => (
                    <li
                      key={t}
                      className={cx(
                        "p-4",
                        i > 0 && "border-t border-line",
                        i === 1 && "sm:border-t-0 sm:border-l",
                        i === 3 && "sm:border-l",
                      )}
                    >
                      <p className="font-semibold">✓ {t}</p>
                      <p className="mt-0.5 text-muted">{d}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </Section>

            {/* ── 02 How ──────────────────────────────────────── */}
            <Section
              id="how"
              index="02"
              label="How it works"
              title="Five calls, one blockchain check."
              intro="Every payment, from a person or a program, goes through the same steps. The only part NimBill can't do for you is sign the transaction: that happens in a wallet."
            >
              <ol className="grid border border-ink sm:grid-cols-5">
                {[
                  ["Read", "GET the board: who, what, which coins."],
                  ["Invoice", "POST what you're paying for."],
                  ["Quote", "Lock the exact coin amount for 5 minutes."],
                  ["Send", "Your wallet sends it, with the memo."],
                  ["Verify", "NimBill checks the chain. Paid."],
                ].map(([t, d], i) => (
                  <li
                    key={t}
                    className={cx("relative p-4", i > 0 && "border-t border-line sm:border-t-0 sm:border-l", i === 3 && "bg-subtle")}
                  >
                    <span className="font-mono text-[11px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                    <p className="mt-1 font-bold">{t}</p>
                    <p className="mt-1 text-xs text-muted">{d}</p>
                    {i === 3 && <p className="mt-2 font-mono text-[10px] tracking-wider uppercase">In a wallet</p>}
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-sm text-muted">
                Why a separate verify step? A transaction hash on its own proves nothing. NimBill reads the transaction from a Nimiq or
                Polygon node and checks the recipient, the amount, the memo and the time before it marks an invoice paid. Each transaction
                can pay only one invoice.
              </p>
            </Section>

            {/* ── 03 Two ways ─────────────────────────────────── */}
            <Section
              id="two-ways"
              index="03"
              label="Two ways to pay"
              title="Hand it to a person, or pay on its own."
              intro="Most AI assistants can't hold money, and they shouldn't ask for your keys. So there are two patterns."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Tile title="Hand-off (most assistants)" className="bg-subtle">
                  <ol className="mt-2 list-decimal space-y-1 pl-4">
                    <li>The assistant reads the board and creates the invoice.</li>
                    <li>It locks a quote and shows you who, what and how much.</li>
                    <li>
                      It gives you the invoice link (<span className="font-mono">/i/&#123;id&#125;</span>) or a{" "}
                      <span className="font-mono">nimiq:</span> payment link.
                    </li>
                    <li>You approve in Nimiq Pay. It checks the invoice until it&apos;s paid.</li>
                  </ol>
                  <p className="mt-3 font-semibold text-ink">Best for ChatGPT, Claude, Grok, Gemini.</p>
                </Tile>
                <Tile title="Autonomous (agents with a wallet)">
                  <ol className="mt-2 list-decimal space-y-1 pl-4">
                    <li>Same first three steps.</li>
                    <li>The agent signs and sends the payment from its own wallet: NIM with the memo, or USDT on Polygon.</li>
                    <li>It reports the hash to verify and waits for &quot;paid&quot;.</li>
                  </ol>
                  <p className="mt-3 font-semibold text-ink">Best for shop backends, bots and agents with a budget.</p>
                </Tile>
              </div>
            </Section>

            {/* ── 04 Quick start ──────────────────────────────── */}
            <Section
              id="quick-start"
              index="04"
              label="Quick start"
              title="Buy a product with curl."
              intro={
                <>
                  Try it against any board. Replace <span className="font-mono text-ink">ada</span> with a real tag (the part before
                  @nimbill), and the ids with the ones you get back.
                </>
              }
            >
              <div className="space-y-5">
                <div>
                  <p className="mb-2 text-sm">
                    <span className="font-semibold">1. Read the board.</span> Note a product <span className="font-mono">id</span>, or check{" "}
                    <span className="font-mono">merchant.openAmounts</span> if you want to pay any amount.
                  </p>
                  <Code label="curl">{`curl ${base}/api/pay/ada`}</Code>
                </div>
                <div>
                  <p className="mb-2 text-sm">
                    <span className="font-semibold">2. Create the invoice.</span> You get back <span className="font-mono">invoice.id</span>{" "}
                    and the total.
                  </p>
                  <Code label="curl">{`curl -X POST ${base}/api/pay/ada/invoices \\
  -H 'content-type: application/json' \\
  -d '{"productId":"PRODUCT_ID","quantity":1,"payerName":"Shop bot for Tunde"}'`}</Code>
                </div>
                <div>
                  <p className="mb-2 text-sm">
                    <span className="font-semibold">3. Lock the price.</span> The quote says exactly how much to send, where, with which
                    memo, and until when.
                  </p>
                  <Code label="curl">{`curl -X POST ${base}/api/invoices/INVOICE_ID/quote \\
  -H 'content-type: application/json' -d '{"asset":"NIM"}'`}</Code>
                </div>
                <div>
                  <p className="mb-2 text-sm">
                    <span className="font-semibold">4. Pay.</span> Send <span className="font-mono">quote.amount</span> Luna to{" "}
                    <span className="font-mono">quote.recipient</span> with <span className="font-mono">quote.memo</span> as data (see{" "}
                    <a href="#sending" className="underline underline-offset-4">
                      Sending the payment
                    </a>
                    ). Or open the invoice link and pay in Nimiq Pay:
                  </p>
                  <Code label="link" copy={false}>{`${base}/i/INVOICE_ID`}</Code>
                </div>
                <div>
                  <p className="mb-2 text-sm">
                    <span className="font-semibold">5. Confirm.</span> Repeat every few seconds while the answer is{" "}
                    <span className="font-mono">&quot;pending&quot;</span>.
                  </p>
                  <Code label="curl">{`curl -X POST ${base}/api/invoices/INVOICE_ID/verify \\
  -H 'content-type: application/json' -d '{"asset":"NIM","txHash":"TX_HASH"}'`}</Code>
                </div>
                <div>
                  <p className="mb-2 text-sm">
                    <span className="font-semibold">The same in JavaScript</span>, for your own agent or backend:
                  </p>
                  <Code label="pay-board.mjs">{`const base = "${base}";
const post = (path, body) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error.message); return j; });

const board = await fetch(\`\${base}/api/pay/ada\`).then((r) => r.json());
const { invoice } = await post("/api/pay/ada/invoices", {
  productId: board.products[0].id, quantity: 1, payerName: "My agent for Tunde",
});
const { quote } = await post(\`/api/invoices/\${invoice.id}/quote\`, { asset: "NIM" });

// Send BigInt(quote.amount) Luna to quote.recipient with quote.memo as data, before quote.expiresAt,
// using your wallet library. Then:
const txHash = await sendNim(quote); // your code

let result;
do {
  await new Promise((r) => setTimeout(r, 3000));
  result = await post(\`/api/invoices/\${invoice.id}/verify\`, { asset: "NIM", txHash });
} while (result.status === "pending");
console.log(result.status, result.invoice?.number); // "paid", "INV-0042"`}</Code>
                </div>
              </div>
            </Section>

            {/* ── 05 Sending ──────────────────────────────────── */}
            <Section
              id="sending"
              index="05"
              label="Sending the payment"
              title="Exact amount, right address, with the memo."
              intro="The quote has everything a wallet needs. The rules differ a little between the two coins."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Tile icon={<CoinIcon coin="NIM" className="h-6 w-6" />} title="NIM (Nimiq)">
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    <li>
                      Amounts are in Luna: <span className="font-mono">1 NIM = 100000</span>. Use integers, never floats.
                    </li>
                    <li>
                      Send a basic transaction to quote.recipient with quote.memo as the data (UTF-8). The memo is how NimBill matches it.
                    </li>
                    <li>Paying more than the quote is accepted. Less is rejected.</li>
                    <li>
                      No wallet code? Hand the person this link, which any Nimiq wallet opens:
                      <span className="mt-1 block font-mono text-xs break-all text-ink">
                        nimiq:NQ16ADMA…FQE4?amount=752.66&amp;message=NimBill%2089mwch33sp
                      </span>
                    </li>
                  </ul>
                </Tile>
                <Tile icon={<CoinIcon coin="USDT" className="h-6 w-6" />} title="USDT (Polygon)">
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    <li>An ERC-20 transfer on Polygon to quote.recipient, with 6 decimals.</li>
                    <li>
                      USDT can&apos;t carry a memo, so the <span className="font-semibold text-ink">exact amount</span> identifies the
                      invoice. Each quote has a unique tail of up to 0.009999 USDT. Don&apos;t round it.
                    </li>
                    <li>The sending wallet needs a little POL for the network fee.</li>
                    <li>It counts after 5 confirmations, a few seconds on Polygon.</li>
                  </ul>
                </Tile>
              </div>
              <p className="mt-4 text-sm text-muted">
                Send before <span className="font-mono">quote.expiresAt</span>. A payment broadcast just before the lock runs out still
                counts if it lands within 3 minutes. Otherwise, ask for a new quote.
              </p>
            </Section>

            {/* ── 06 Reference ────────────────────────────────── */}
            <Section
              id="reference"
              index="06"
              label="API reference"
              title="Every public endpoint."
              intro={
                <>
                  Base URL <span className="font-mono text-ink">{base}</span>. JSON in and out. Errors are{" "}
                  <span className="font-mono text-ink">{"{ error: { code, message } }"}</span> with a matching HTTP status; the message is
                  safe to show a person. Machine-readable: <TextLink href="/openapi.json">openapi.json</TextLink>.
                </>
              }
            >
              <ul className="mb-8 divide-y divide-line border border-ink">
                {ENDPOINTS.map((e) => (
                  <li key={e.id}>
                    <a href={`#${e.id}`} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-subtle">
                      <MethodBadge method={e.method} />
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">{e.path}</span>
                      <span className="hidden text-sm text-muted sm:inline">{e.summary}</span>
                    </a>
                  </li>
                ))}
              </ul>
              <div className="space-y-12">
                {ENDPOINTS.map((e) => (
                  <article key={e.id} id={e.id} className="scroll-mt-20 space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <MethodBadge method={e.method} />
                      <h3 className="font-mono text-base font-semibold break-all">{e.path}</h3>
                    </div>
                    <div>
                      <p className="font-bold">{e.summary}</p>
                      <p className="mt-1 text-sm text-muted">{e.why}</p>
                    </div>
                    {e.params && <Fields title="Path" fields={e.params} />}
                    {e.query && <Fields title="Query" fields={e.query} />}
                    {e.body && <Fields title="Body (JSON)" fields={e.body} />}
                    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
                      {e.example.request !== undefined && <Code label="Example request">{json(e.example.request)}</Code>}
                      <Code label="Example response">{json(e.example.response)}</Code>
                    </div>
                    <div>
                      <Eyebrow className="mb-1">When it goes wrong</Eyebrow>
                      <ul className="space-y-0.5 font-mono text-xs text-muted">
                        {e.errors.map((er) => (
                          <li key={er}>· {er}</li>
                        ))}
                      </ul>
                    </div>
                  </article>
                ))}
              </div>
            </Section>

            {/* ── 07 Setup ────────────────────────────────────── */}
            <Section
              id="setup"
              index="07"
              label="Set up your AI"
              title="Teach your assistant to pay with NimBill."
              intro="Copy one of these once. After that, “pay ada@nimbill for the logo pack” is enough."
            >
              <div className="space-y-6">
                <SetupCard logos={["claude", "cursor"]} title="MCP Server: give your AI agent its own Nimiq wallet">
                  <p>
                    The <span className="font-mono text-ink">nimbill-mcp</span> server (on npm) gives your agent its own non-custodial
                    Ed25519 Nimiq wallet (<span className="font-mono text-ink">~/.nimbill/agent-wallet.json</span>) and 15 tools to claim a{" "}
                    <span className="font-mono text-ink">@tag</span>, pay invoices and boards on-chain, send NIM by tag, and write or cash
                    cheques. See the full guide and all 15 tools on <TextLink href="/mcp">/mcp</TextLink>.
                  </p>
                  <Code label="mcp.json">
                    {json({
                      mcpServers: {
                        nimbill: {
                          command: "npx",
                          args: ["-y", "nimbill-mcp"],
                          env: {
                            NIMBILL_URL: base,
                          },
                        },
                      },
                    })}
                  </Code>
                </SetupCard>

                <SetupCard logos={["claude"]} title="Claude: install the skill">
                  <p>
                    A skill is a folder with a <span className="font-mono text-ink">SKILL.md</span> that Claude loads when a task matches
                    it. In Claude Code, run this once to install it for all your projects:
                  </p>
                  <Code label="terminal">{`mkdir -p ~/.claude/skills/nimbill-pay && curl -s ${base}/skill.md -o ~/.claude/skills/nimbill-pay/SKILL.md`}</Code>
                  <p>
                    Or save the file below as <span className="font-mono text-ink">.claude/skills/nimbill-pay/SKILL.md</span> in a project.
                    In Claude apps that let you add skills, upload it there.
                  </p>
                  <Code label="SKILL.md">{skillMarkdown(base)}</Code>
                </SetupCard>

                <SetupCard logos={["cursor"]} title="Cursor: add a project rule">
                  <p>
                    For building NimBill payments into your own app. Save this as{" "}
                    <span className="font-mono text-ink">.cursor/rules/nimbill.mdc</span>, and Cursor&apos;s agent will use it when you ask
                    it to add NimBill checkout, invoices or verification.
                  </p>
                  <Code label=".cursor/rules/nimbill.mdc">{cursorRule(base)}</Code>
                </SetupCard>

                <SetupCard logos={["openai"]} title="ChatGPT: make a custom GPT">
                  <ol className="list-decimal space-y-1 pl-4">
                    <li>In ChatGPT, create a GPT and open Configure.</li>
                    <li>
                      Under Actions, create a new action and choose Import from URL:{" "}
                      <span className="font-mono break-all text-ink">{base}/openapi.json</span>
                    </li>
                    <li>Paste the instructions below into Instructions, and save.</li>
                  </ol>
                  <p className="text-xs">Actions need a public https address, so use your live NimBill site, not localhost.</p>
                  <Code label="Instructions">{chatInstructions(base)}</Code>
                </SetupCard>

                <SetupCard logos={["grok", "gemini", "perplexity"]} title="Grok, Gemini, Perplexity and other chats">
                  <p>
                    Paste this at the start of a chat, or into the assistant&apos;s custom instructions. Assistants that can browse can also
                    read <TextLink href="/llms.txt">{`${base}/llms.txt`}</TextLink> on their own.
                  </p>
                  <Code label="Instructions">{chatInstructions(base)}</Code>
                </SetupCard>

                <SetupCard logos={[]} title="Your own agent or code">
                  <p>Point your framework at one of these. They describe the same API.</p>
                  <ul className="grid gap-2 sm:grid-cols-3">
                    {[
                      ["/llms.txt", "llms.txt", "Plain-text guide for language models"],
                      ["/openapi.json", "openapi.json", "OpenAPI 3.1 for tools and code generators"],
                      ["/skill.md", "skill.md", "The agent skill as a file"],
                    ].map(([href, label, d]) => (
                      <li key={href}>
                        <a href={href} className="block border border-ink p-3 transition-colors hover:bg-ink hover:text-paper">
                          <span className="font-mono text-sm font-semibold">{label}</span>
                          <span className="mt-0.5 block text-xs opacity-70">{d}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </SetupCard>
              </div>
            </Section>

            {/* ── 08 Safety ───────────────────────────────────── */}
            <Section id="safety" index="08" label="Safety and limits" title="Money moves for real.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Tile title="For anyone building an agent">
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    <li>
                      Show the person the merchant&apos;s name and handle, what it&apos;s for and the exact amount, and get a clear yes.
                    </li>
                    <li>Give agents a spending limit, and a wallet that holds only what they may spend.</li>
                    <li>Never ask anyone for a seed phrase or private key. Hand off with a link instead.</li>
                    <li>Check the tag (GET /api/tags/&#123;tag&#125;): lookalike tags exist.</li>
                  </ul>
                </Tile>
                <Tile title="Limits and guarantees">
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {AGENT_RULES.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                    <li>Quotes last 5 minutes. Unpaid board invoices disappear from the merchant&apos;s view after 7 days.</li>
                  </ul>
                </Tile>
              </div>
              <div className="mt-10 flex flex-col items-start gap-3 border border-ink bg-ink p-6 text-paper sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-bold">Want to be paid this way?</p>
                  <p className="text-sm text-paper/70">Claim a tag and your board is live in a minute.</p>
                </div>
                <LinkButton href="/" variant="secondary" className="border-paper">
                  Get your tag
                </LinkButton>
              </div>
              <p className="mt-6 text-xs text-muted">
                Questions or something missing? See{" "}
                <Link href="/stats" className="underline underline-offset-4">
                  payments made with NimBill
                </Link>{" "}
                to watch it work.
              </p>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

function SetupCard({ logos, title, children }: { logos: string[]; title: string; children: React.ReactNode }) {
  return (
    <article className="border border-ink">
      <header className="flex items-center gap-3 border-b border-ink p-4">
        {logos.length > 0 ? (
          <span className="flex items-center gap-2">
            {logos.map((k) => (
              <span key={k} className="flex h-10 w-10 items-center justify-center border border-ink">
                <AiLogo logo={logo(k)} size={22} />
              </span>
            ))}
          </span>
        ) : (
          <span aria-hidden className="flex h-10 w-10 items-center justify-center border border-ink font-mono font-bold">
            {"{}"}
          </span>
        )}
        <h3 className="font-bold">{title}</h3>
      </header>
      <div className="space-y-3 p-4 text-sm text-muted">{children}</div>
    </article>
  );
}
