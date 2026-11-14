import type { Metadata } from "next";
import { headers } from "next/headers";
import { Logo, LogoStrip, ToolCard } from "@/components/docs/AiParts";
import { Card, Cards, Code, DocPage, H2, Step, Steps, Tile } from "@/components/docs/DocsParts";
import { mcpConfig } from "@/components/docs/mcp-data";
import { LinkButton, TextLink, buttonStyles } from "@/components/ui";
import { AGENT_STEPS, agentUrl } from "@/lib/agent-docs";
import { requestOrigin } from "@/lib/request-origin";

export const metadata: Metadata = {
  title: "AI assistants",
  description: "How ChatGPT, Claude, Cursor, Grok and other AI assistants pay with NimBill, and how to set yours up.",
};

/** How an AI assistant uses NimBill: the two patterns, the steps it follows, and the setups. */
export default async function AiOverview() {
  const base = requestOrigin(await headers());

  return (
    <DocPage title="How an AI pays with NimBill" description="Teach your assistant to pay with NimBill.">
      <p className="text-muted sm:text-lg">
        An assistant that can make HTTP requests can pay any NimBill board: it reads the board, makes the invoice and locks the price. Copy
        one of the setups below once. After that, “pay ada@nimbill for the logo pack” is enough.
      </p>
      <div className="flex flex-wrap gap-3">
        <a href="#setup" className={buttonStyles({ size: "md" })}>
          Set up your AI
        </a>
        <LinkButton href="/mcp" variant="secondary" size="md">
          Give it a wallet (MCP) →
        </LinkButton>
      </div>

      <H2 id="works-with">Works with</H2>
      <LogoStrip title="Works with" footnote="…and any agent or program that can make HTTP requests. Logos belong to their owners." />

      <H2 id="two-ways">Two ways to pay</H2>
      <p className="text-muted">
        <span className="font-semibold text-ink">Hand it to a person, or pay on its own.</span> Most AI assistants can&apos;t hold money,
        and they shouldn&apos;t ask for your keys. So there are two patterns.
      </p>
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

      <H2 id="steps">What the assistant does</H2>
      <p className="text-muted">
        These are the steps every setup teaches. A board&apos;s own JSON (<span className="font-mono text-ink">howToPay</span>) and{" "}
        <TextLink href="/llms.txt">llms.txt</TextLink> give the same steps, so an assistant that reads either can follow them.
      </p>
      <Steps>
        {AGENT_STEPS.map((s, i) => (
          <Step key={s.title} n={i + 1} title={s.title}>
            {s.method && s.path && (
              <p className="font-mono text-xs break-all text-ink">
                <span className="font-bold">{s.method}</span> {agentUrl(base, s.path)}
              </p>
            )}
            {s.body && <Code label="Body">{JSON.stringify(s.body)}</Code>}
            <p>{s.text}</p>
          </Step>
        ))}
      </Steps>

      <H2 id="setup">Set up your AI</H2>
      <p className="text-muted">Copy one of these once. Each page has the file or instructions to paste.</p>
      <Cards>
        <Card href="/ai/claude" title="Claude" icon={<Logo name="claude" />}>
          Install the nimbill-pay skill.
        </Card>
        <Card href="/ai/chatgpt" title="ChatGPT" icon={<Logo name="openai" />}>
          Make a custom GPT with a NimBill action.
        </Card>
        <Card href="/ai/cursor" title="Cursor" icon={<Logo name="cursor" />}>
          Add a project rule for building NimBill payments.
        </Card>
        <Card href="/ai/other" title="Grok, Gemini, Perplexity" icon={<Logo name="grok" />}>
          Paste instructions into any chat.
        </Card>
        <Card href="/ai/own-agent" title="Your own agent or code" icon="{}">
          Point your framework at llms.txt, openapi.json or skill.md.
        </Card>
        <Card href="/mcp" title="MCP Agent Wallet" icon="◆">
          Give Claude or Cursor its own Nimiq wallet and 15 tools.
        </Card>
      </Cards>

      <ToolCard id="mcp" logos={["claude", "cursor"]} title="MCP Server: give your AI agent its own Nimiq wallet">
        <p>
          The <span className="font-mono text-ink">nimbill-mcp</span> server (on npm) gives your agent its own non-custodial Ed25519 Nimiq
          wallet (<span className="font-mono text-ink">~/.nimbill/agent-wallet.json</span>) and 15 tools to claim a{" "}
          <span className="font-mono text-ink">@tag</span>, pay invoices and boards on-chain, send NIM by tag, and write or cash cheques. See
          the full guide and all 15 tools on <TextLink href="/mcp">/mcp</TextLink>.
        </p>
        <Code label="mcp.json">
          {JSON.stringify(mcpConfig(base), null, 2)}
        </Code>
      </ToolCard>

      <H2 id="files">Files for agents</H2>
      <p className="text-muted">They describe the same API, made from the same source as these pages.</p>
      <Cards cols={3}>
        <Card href="/llms.txt" title="llms.txt">
          Plain-text guide for language models
        </Card>
        <Card href="/openapi.json" title="openapi.json">
          OpenAPI 3.1 for tools and code generators
        </Card>
        <Card href="/skill.md" title="skill.md">
          The agent skill as a file
        </Card>
      </Cards>
    </DocPage>
  );
}
