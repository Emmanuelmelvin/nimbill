import type { Metadata } from "next";
import { headers } from "next/headers";
import { Callout, Code, DocPage, H2, Step, Steps } from "@/components/docs/DocsParts";
import { chatInstructions } from "@/lib/api-reference";
import { requestOrigin } from "@/lib/request-origin";

export const metadata: Metadata = {
  title: "ChatGPT",
  description: "Make a custom GPT that pays NimBill boards and invoices, using NimBill's OpenAPI spec as an action.",
};

export default async function ChatGptSetup() {
  const base = requestOrigin(await headers());
  return (
    <DocPage title="ChatGPT" description="Make a custom GPT.">
      <H2 id="custom-gpt">Make a custom GPT</H2>
      <Steps>
        <Step n={1} title="In ChatGPT, create a GPT and open Configure." />
        <Step n={2} title="Add the NimBill action.">
          <p>Under Actions, create a new action and choose Import from URL:</p>
          <Code label="Import from URL">{`${base}/openapi.json`}</Code>
        </Step>
        <Step n={3} title="Paste the instructions below into Instructions, and save." />
      </Steps>
      <Callout type="warning" title="Use your live site">
        <p>Actions need a public https address, so use your live NimBill site, not localhost.</p>
      </Callout>

      <H2 id="instructions">Instructions</H2>
      <Code label="Instructions">{chatInstructions(base)}</Code>
    </DocPage>
  );
}
