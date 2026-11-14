import type { Metadata } from "next";
import { Callout, DocPage, H2, Tile } from "@/components/docs/DocsParts";
import { TextLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "Fund your agent",
  description: "Three ways to give your NimBill MCP agent spending money: a cheque, its @tag, or its NQ address.",
};

export default function McpFunding() {
  return (
    <DocPage title="Fund your agent" description="Three ways to give your agent spending money.">
      <Callout type="note" title="It starts empty">
        <p>Your agent starts with a fresh wallet (0 NIM) so it can only ever spend what you intentionally put into it.</p>
      </Callout>

      <H2 id="ways">Three ways to fund it</H2>
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile icon="1" title="Hand it a NimBill Cheque">
          Write a cheque on <TextLink href="/cheques">/cheques</TextLink> and paste the <span className="font-mono text-ink">CHQ-…</span>{" "}
          code into chat: <span className="text-ink italic">&ldquo;Cash this cheque into your wallet.&rdquo;</span> Because the cheque itself
          holds the funds, your agent can claim it even when its balance is 0 NIM.
        </Tile>
        <Tile icon="2" title="Send to its @tag">
          Ask your agent to run <span className="font-mono text-ink">setup_profile</span> to claim a tag like{" "}
          <span className="font-mono text-ink">mybot@nimbill</span>, then send NIM to that tag from <TextLink href="/send">/send</TextLink> in
          Nimiq Pay.
        </Tile>
        <Tile icon="3" title="Send to its NQ… address">
          Ask your agent <span className="text-ink italic">&ldquo;What is your Nimiq wallet address?&rdquo;</span> (calls{" "}
          <span className="font-mono text-ink">wallet_status</span>) and send NIM from any Nimiq wallet.
        </Tile>
      </div>
    </DocPage>
  );
}
