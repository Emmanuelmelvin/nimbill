import type { Metadata } from "next";
import { headers } from "next/headers";
import { ToolCard } from "@/components/docs/AiParts";
import { Code, DefinitionBox, DocPage, H2 } from "@/components/docs/DocsParts";
import { NODE_MIN, NPM_URL, PKG, agentSetupPrompt, mcpConfig, mcpEnvVars } from "@/components/docs/mcp-data";
import { TextLink } from "@/components/ui";
import { requestOrigin } from "@/lib/request-origin";

export const metadata: Metadata = {
  title: "Connect your AI",
  description: "Add the NimBill Agent Wallet MCP server to Claude Desktop, Claude Code, Cursor, Antigravity or Windsurf.",
};

const json = (v: unknown) => JSON.stringify(v, null, 2);

export default async function McpConnect() {
  const base = requestOrigin(await headers());
  const config = mcpConfig(base);

  return (
    <DocPage title="Connect your AI" description="Set it up in 60 seconds.">
      <p className="text-muted">
        The MCP server is the &quot;{PKG}&quot; package on npm. It runs locally over stdio with Node.js {NODE_MIN}+, and npx fetches it on
        first launch, so there is nothing to clone or build.
      </p>

      <ToolCard id="agent-install" logos={[]} solid title="Fastest: let your agent install it">
        <p>
          Paste this into Claude Code, Cursor, Windsurf or Antigravity. The agent installs{" "}
          <TextLink href={NPM_URL} external>
            {PKG}
          </TextLink>{" "}
          from npm, wires it into its own config, and shows you its new wallet address. It will ask you for a passphrase to encrypt the
          wallet.
        </p>
        <Code label="prompt for your agent">{agentSetupPrompt(base)}</Code>
        <p>Prefer to do it by hand? Pick your client below.</p>
      </ToolCard>

      <ToolCard id="claude-desktop" logos={["claude"]} title="Claude Desktop">
        <p>
          Add this to your <span className="font-mono text-ink">claude_desktop_config.json</span> (macOS:{" "}
          <span className="font-mono break-all text-ink">~/Library/Application Support/Claude/claude_desktop_config.json</span>, Windows:{" "}
          <span className="font-mono break-all text-ink">%APPDATA%\Claude\claude_desktop_config.json</span>) and restart Claude Desktop:
        </p>
        <Code label="claude_desktop_config.json">{json(config)}</Code>
      </ToolCard>

      <ToolCard id="claude-code" logos={["claude"]} title="Claude Code (CLI)">
        <p>Run this command in your terminal to register the NimBill Agent Wallet MCP server in Claude Code:</p>
        <Code label="terminal">{`claude mcp add nimbill -e NIMBILL_URL=${base} -- npx -y ${PKG}`}</Code>
      </ToolCard>

      <ToolCard id="cursor" logos={["cursor"]} title="Cursor">
        <p>
          Save this in your project&apos;s <span className="font-mono text-ink">.cursor/mcp.json</span> (or globally in{" "}
          <span className="font-mono text-ink">~/.cursor/mcp.json</span>), then enable the <span className="font-mono text-ink">nimbill</span>{" "}
          server under Cursor Settings → MCP:
        </p>
        <Code label=".cursor/mcp.json">{json(config)}</Code>
      </ToolCard>

      <ToolCard id="other-clients" logos={["gemini"]} title="Google Antigravity / Windsurf / Other MCP Clients">
        <p>
          Add the <span className="font-mono text-ink">nimbill</span> entry to your client&apos;s{" "}
          <span className="font-mono text-ink">mcp_config.json</span>:
        </p>
        <Code label="mcp_config.json">{json(config)}</Code>
      </ToolCard>

      <H2 id="env">Environment variables</H2>
      <DefinitionBox
        title="Environment variables (all optional)"
        rows={mcpEnvVars(base).map(([name, def, desc]) => [name, `Default: ${def}`, desc])}
      />
    </DocPage>
  );
}
