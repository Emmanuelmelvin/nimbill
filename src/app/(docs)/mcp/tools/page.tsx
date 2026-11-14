import type { Metadata } from "next";
import { Code, DocPage, Fields, H2 } from "@/components/docs/DocsParts";
import { TOOLS, TOOL_CATEGORIES } from "@/components/docs/mcp-data";
import { categoryId } from "@/components/docs/nav";
import { Badge } from "@/components/ui";

export const metadata: Metadata = {
  title: "MCP tools",
  description: "Every tool the NimBill Agent Wallet MCP server exposes, with arguments and example responses, plus the nimbill://wallet resource.",
};

const json = (v: unknown) => JSON.stringify(v, null, 2);

export default function McpTools() {
  return (
    <DocPage title={`All ${TOOLS.length} MCP tools`} description="Complete tool & resource reference.">
      <p className="text-muted">Every tool exposed by mcp/index.mjs over tools/list and tools/call, plus the nimbill://wallet resource.</p>

      <H2 id="resource">nimbill://wallet resource</H2>
      <div className="border border-ink p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-sm font-bold">nimbill://wallet</span>
          <Badge variant="outline">MCP Resource</Badge>
        </div>
        <p className="mt-2 text-sm text-muted">
          Read-only JSON resource exposing the agent&apos;s <span className="font-mono text-ink">NQ…</span> address, public key, live
          on-chain NIM balance, and signed-in NimBill profile so MCP hosts can attach wallet context automatically.
        </p>
      </div>

      {TOOL_CATEGORIES.map((c) => (
        <section key={c} className="space-y-5">
          <H2 id={categoryId(c)}>{c}</H2>
          {TOOLS.filter((t) => t.category === c).map((t) => (
            <article key={t.name} className="border border-ink">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink bg-subtle p-4">
                <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                  <h3 id={`tool-${t.name}`} className="scroll-mt-28 bg-ink px-2 py-0.5 font-mono text-xs font-bold text-paper">
                    {t.name}
                  </h3>
                  <span className="text-sm font-semibold">{t.summary}</span>
                </div>
                <Badge variant="outline">{t.category}</Badge>
              </header>
              <div className="space-y-4 p-4">
                <p className="text-sm text-muted">{t.description}</p>
                {t.fields && <Fields title="Arguments" fields={t.fields} />}
                <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
                  <Code label="Tool arguments" copy={false}>
                    {json(t.exampleCall)}
                  </Code>
                  <Code label="Tool response" copy={false}>
                    {json(t.exampleResult)}
                  </Code>
                </div>
              </div>
            </article>
          ))}
        </section>
      ))}
    </DocPage>
  );
}
