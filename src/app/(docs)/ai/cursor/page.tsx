import type { Metadata } from "next";
import { headers } from "next/headers";
import { Callout, Code, DocPage, H2 } from "@/components/docs/DocsParts";
import { TextLink } from "@/components/ui";
import { cursorRule } from "@/lib/api-reference";
import { requestOrigin } from "@/lib/request-origin";

export const metadata: Metadata = {
  title: "Cursor",
  description: "A Cursor project rule for building NimBill checkout, invoices and payment verification into your own app.",
};

export default async function CursorSetup() {
  const base = requestOrigin(await headers());
  return (
    <DocPage title="Cursor" description="Add a project rule.">
      <p className="text-muted">
        For building NimBill payments into your own app. Save this as{" "}
        <span className="font-mono text-ink">.cursor/rules/nimbill.mdc</span>, and Cursor&apos;s agent will use it when you ask it to add
        NimBill checkout, invoices or verification.
      </p>

      <H2 id="rule">Add a project rule</H2>
      <Code label=".cursor/rules/nimbill.mdc">{cursorRule(base)}</Code>

      <Callout type="note" title="Want Cursor's agent to pay on its own?">
        <p>
          Add the <TextLink href="/mcp/connect#cursor">MCP Agent Wallet</TextLink> to give it its own Nimiq wallet.
        </p>
      </Callout>
    </DocPage>
  );
}
