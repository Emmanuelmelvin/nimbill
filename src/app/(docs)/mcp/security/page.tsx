import type { Metadata } from "next";
import { Code, CtaBox, DocPage, H2, Tile } from "@/components/docs/DocsParts";
import { TOOLS } from "@/components/docs/mcp-data";
import { LinkButton } from "@/components/ui";

export const metadata: Metadata = {
  title: "Under the hood and security",
  description: "How the NimBill MCP server signs in, builds Nimiq Albatross transactions and 2-of-2 cheques, and keeps your main wallet safe.",
};

export default function McpSecurity() {
  return (
    <DocPage title="Under the hood and security" description="Real Nimiq Albatross cryptography, zero custody.">
      <H2 id="architecture">How it works under the hood</H2>
      <p className="text-muted">The MCP server speaks Nimiq Mainnet Albatross (network ID 24) and NimBill&apos;s session protocol directly.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile title="Passwordless Wallet Sign-In">
          When a tool requires authentication, <span className="font-mono text-ink">mcp/client.mjs</span> fetches{" "}
          <span className="font-mono text-ink">/api/auth/challenge</span>, signs{" "}
          <span className="font-mono text-ink">\x16Nimiq Signed Message:\n…</span> with the agent&apos;s Ed25519 key, and exchanges it at{" "}
          <span className="font-mono text-ink">/api/auth/verify</span> for an httpOnly session cookie.
        </Tile>
        <Tile title="Basic & Extended Transactions">
          <span className="font-mono text-ink">mcp/wallet.mjs</span> serializes both 139-byte{" "}
          <span className="font-mono text-ink">TransactionFormat::Basic</span> transfers and{" "}
          <span className="font-mono text-ink">TransactionFormat::Extended</span> transfers carrying{" "}
          <span className="font-mono text-ink">recipient_data</span> memos (<span className="font-mono text-ink">NimBill …</span>), then
          broadcasts via <span className="font-mono text-ink">sendRawTransaction</span>.
        </Tile>
        <Tile title="2-of-2 Threshold Cheques">
          Each cheque address combines a link public key (<span className="font-mono text-ink">A_link</span>) with NimBill&apos;s
          rule-enforcing key (<span className="font-mono text-ink">A_server</span>). When cashing or cancelling, the agent combines both
          partial Ed25519 signatures into a standard 64-byte signature on-chain.
        </Tile>
      </div>

      <H2 id="security">Security and custody</H2>
      <p className="text-muted">
        <span className="font-semibold text-ink">Built so your main wallet stays untouched.</span>
      </p>
      <Tile title="Dedicated Agent Wallet">
        <ul className="mt-2 list-disc space-y-1.5 pl-4">
          <li>Never put your personal recovery phrase into an AI tool.</li>
          <li>
            The MCP server creates a separate, dedicated wallet at <span className="font-mono text-ink">~/.nimbill/agent-wallet.json</span>{" "}
            with <span className="font-mono">0600</span> file permissions.
          </li>
          <li>Fund it only with the amount you want your agent to spend — or top it up per task using a NimBill cheque.</li>
        </ul>
      </Tile>

      <H2 id="test">Test it locally</H2>
      <p className="text-muted">
        Run the automated MCP test suite in the repository to verify wallet generation, Albatross transaction signing, and all{" "}
        {TOOLS.length} tools:
      </p>
      <Code label="terminal">npm run test:mcp</Code>

      <div className="pt-6">
        <CtaBox
          title="Ready to fund your agent?"
          text="Write a cheque in Nimiq Pay and paste the code into your AI chat."
          action={
            <LinkButton href="/cheques" variant="secondary" className="border-paper">
              Write a cheque
            </LinkButton>
          }
        />
      </div>
    </DocPage>
  );
}
