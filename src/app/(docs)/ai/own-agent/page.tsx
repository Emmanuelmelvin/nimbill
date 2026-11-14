import type { Metadata } from "next";
import { Card, Cards, DocPage, H2 } from "@/components/docs/DocsParts";
import { TextLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "Your own agent or code",
  description: "Point your agent framework at NimBill's llms.txt, openapi.json or skill.md.",
};

export default function OwnAgent() {
  return (
    <DocPage title="Your own agent or code" description="Point your framework at one of these. They describe the same API.">
      <H2 id="files">Point it at a file</H2>
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
      <p className="text-muted">
        Writing the calls yourself? Start with the <TextLink href="/docs/quick-start">quick start</TextLink> and the{" "}
        <TextLink href="/docs/api">Board API</TextLink> reference.
      </p>

      <H2 id="mcp">Give it a wallet</H2>
      <p className="text-muted">
        An agent that should pay on its own needs a wallet. The <TextLink href="/mcp">MCP Agent Wallet</TextLink> gives any MCP client a
        non-custodial Nimiq wallet with spending limits, or sign and send from your own wallet code (see{" "}
        <TextLink href="/docs/sending">Sending the payment</TextLink>).
      </p>
    </DocPage>
  );
}
