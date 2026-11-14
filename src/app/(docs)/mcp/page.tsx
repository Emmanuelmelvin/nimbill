import type { Metadata } from "next";
import { LogoStrip } from "@/components/docs/AiParts";
import { Code, DocPage, H2, Tile } from "@/components/docs/DocsParts";
import { NODE_MIN, NPM_URL, PKG, PKG_VERSION, PROMPTS, TOOLS } from "@/components/docs/mcp-data";
import { Badge, CoinText, LinkButton, buttonStyles } from "@/components/ui";

export const metadata: Metadata = {
  title: "MCP Server (Agent Wallet)",
  description:
    "Connect Claude, Cursor, Windsurf, or Antigravity to NimBill via Model Context Protocol (MCP) — giving your AI agent its own non-custodial Nimiq wallet, @tag, on-chain payments, and cheques.",
};

export default function McpOverview() {
  return (
    <DocPage title="Give your AI agent its own Nimiq wallet.">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="solid">{TOOLS.length} Tools</Badge>
        <Badge variant="outline">Non-Custodial Agent Wallet</Badge>
        <Badge variant="outline">Model Context Protocol (MCP)</Badge>
      </div>
      <p className="text-muted sm:text-lg">
        NimBill ships an MCP server on npm (<span className="font-mono text-ink">npx -y {PKG}</span>) that gives Claude, Cursor, Windsurf,
        and Antigravity their own non-custodial Ed25519 Nimiq wallet, a <span className="font-mono text-ink">@tag</span>, and{" "}
        <CoinText>{`${TOOLS.length} tools to pay invoices, buy from boards, send NIM by tag, and write or cash cheques on-chain.`}</CoinText>
      </p>
      <div className="flex flex-wrap gap-3">
        <LinkButton href="/mcp/connect" size="md">
          Connect your AI
        </LinkButton>
        <LinkButton href="/mcp/tools" variant="secondary" size="md">
          Explore all {TOOLS.length} tools
        </LinkButton>
        <a href={NPM_URL} target="_blank" rel="noopener noreferrer" className={buttonStyles({ variant: "secondary", size: "md" })}>
          View on npm ↗
        </a>
        <LinkButton href="/docs" variant="secondary" size="md">
          HTTP API docs
        </LinkButton>
      </div>

      <H2 id="install">Run it with npx</H2>
      {/* The npm package at a glance: one command runs it, nothing to clone. */}
      <div className="grid gap-0 border border-ink sm:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex items-center gap-3 border-b border-ink bg-ink px-4 py-3 text-paper sm:border-r sm:border-b-0">
          <span className="font-mono text-[11px] font-semibold tracking-wider uppercase">npm</span>
          <span className="font-mono text-sm font-semibold">{PKG}</span>
          <span className="border border-paper/40 px-1.5 py-px font-mono text-[10px]">v{PKG_VERSION}</span>
        </div>
        <Code copy className="border-0" label={`Node ${NODE_MIN}+ · no install needed`}>{`npx -y ${PKG}`}</Code>
      </div>

      <H2 id="hosts">Compatible hosts</H2>
      <LogoStrip title="Compatible MCP hosts & AI assistants" />

      <H2 id="what-it-does">What it does</H2>
      <p className="text-muted">
        <span className="font-semibold text-ink">An AI agent that can earn, spend, and hold NIM.</span> Most payment APIs stop at creating a
        link for a human to click. NimBill&apos;s MCP server gives your agent its own Nimiq keypair on your machine so it can complete the
        entire loop on-chain.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Tile icon="01" title="Own Non-Custodial Nimiq Wallet">
          On first launch, the MCP server generates an Ed25519 keypair at{" "}
          <span className="font-mono text-ink">~/.nimbill/agent-wallet.json</span>, derives its <span className="font-mono text-ink">NQ…</span>{" "}
          address, and signs NimBill&apos;s challenge message to log into its own account. Your agent&apos;s private key never leaves your
          computer.
        </Tile>
        <Tile icon="02" title="Pay Invoices & Boards On-Chain">
          The agent can read any <span className="font-mono text-ink">/pay/&lt;tag&gt;</span> board or{" "}
          <span className="font-mono text-ink">NMN-…</span> invoice, lock a 5-minute NIM quote, sign the Nimiq Albatross transaction with
          the <span className="font-mono text-ink">NimBill &lt;id&gt;</span> memo, broadcast it, and verify the receipt.
        </Tile>
        <Tile icon="03" title="Write & Cash Cheques">
          Hand your agent a <span className="font-mono text-ink">CHQ-…</span> code in chat and it can cash the NIM straight into its wallet
          (or route it to any <span className="font-mono text-ink">@tag</span>) — or ask your agent to write a funded cheque and hand you the
          link.
        </Tile>
        <Tile icon="04" title="Claim a @tag & Bill Clients">
          Your agent can claim its own handle like <span className="font-mono text-ink">studiobot@nimbill</span>, issue invoices in 19
          currencies, and check when clients have paid on the blockchain.
        </Tile>
      </div>

      <H2 id="prompts">Example prompts</H2>
      <p className="text-muted">
        <span className="font-semibold text-ink">What you can ask your AI once connected.</span> Try any of these prompts in Claude, Cursor,
        or Antigravity after adding the MCP server.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {PROMPTS.map((p) => (
          <div key={p.title} className="flex flex-col justify-between border border-ink p-4">
            <div>
              <p className="font-mono text-[11px] font-semibold tracking-wider text-muted uppercase">{p.title}</p>
              <p className="mt-2 text-sm font-medium text-ink">&ldquo;{p.prompt}&rdquo;</p>
            </div>
          </div>
        ))}
      </div>
    </DocPage>
  );
}
