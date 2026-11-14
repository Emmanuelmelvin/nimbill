import type { Metadata } from "next";
import { headers } from "next/headers";
import { ToolCard } from "@/components/docs/AiParts";
import { Callout, Code, DocPage, H2 } from "@/components/docs/DocsParts";
import { TextLink } from "@/components/ui";
import { skillMarkdown } from "@/lib/api-reference";
import { requestOrigin } from "@/lib/request-origin";

export const metadata: Metadata = {
  title: "Claude",
  description: "Install the nimbill-pay skill so Claude can pay NimBill tags, boards and invoices.",
};

export default async function ClaudeSetup() {
  const base = requestOrigin(await headers());
  return (
    <DocPage title="Claude" description="Install the skill.">
      <p className="text-muted">
        A skill is a folder with a <span className="font-mono text-ink">SKILL.md</span> that Claude loads when a task matches it.
      </p>

      <H2 id="install">Install the skill</H2>
      <ToolCard id="claude-code" logos={["claude"]} title="Claude Code">
        <p>Run this once to install it for all your projects:</p>
        <Code label="terminal">{`mkdir -p ~/.claude/skills/nimbill-pay && curl -s ${base}/skill.md -o ~/.claude/skills/nimbill-pay/SKILL.md`}</Code>
        <p>
          Or save the file below as <span className="font-mono text-ink">.claude/skills/nimbill-pay/SKILL.md</span> in a project.
        </p>
      </ToolCard>
      <Callout type="tip" title="Claude apps">
        <p>In Claude apps that let you add skills, upload the file below there.</p>
      </Callout>

      <H2 id="skill-file">SKILL.md</H2>
      <p className="text-muted">
        The same file is served at <TextLink href="/skill.md">{`${base}/skill.md`}</TextLink>.
      </p>
      <Code label="SKILL.md">{skillMarkdown(base)}</Code>

      <Callout type="note" title="Want Claude to pay on its own?">
        <p>
          The skill hands payments to you to approve. To give Claude its own wallet, add the{" "}
          <TextLink href="/mcp/connect">MCP Agent Wallet</TextLink>.
        </p>
      </Callout>
    </DocPage>
  );
}
