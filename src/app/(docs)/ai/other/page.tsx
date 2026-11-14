import type { Metadata } from "next";
import { headers } from "next/headers";
import { LogoStrip } from "@/components/docs/AiParts";
import { Code, DocPage, H2 } from "@/components/docs/DocsParts";
import { TextLink } from "@/components/ui";
import { chatInstructions } from "@/lib/api-reference";
import { requestOrigin } from "@/lib/request-origin";

export const metadata: Metadata = {
  title: "Grok, Gemini and others",
  description: "Instructions to paste into Grok, Gemini, Perplexity or any other chat so it can pay with NimBill.",
};

export default async function OtherChats() {
  const base = requestOrigin(await headers());
  return (
    <DocPage title="Grok, Gemini, Perplexity and other chats" description="Paste instructions into any chat.">
      <LogoStrip title="Works with" />

      <H2 id="instructions">Instructions</H2>
      <p className="text-muted">Paste this at the start of a chat, or into the assistant&apos;s custom instructions.</p>
      <Code label="Instructions">{chatInstructions(base)}</Code>

      <H2 id="browsing">Assistants that browse</H2>
      <p className="text-muted">
        Assistants that can browse can also read <TextLink href="/llms.txt">{`${base}/llms.txt`}</TextLink> on their own.
      </p>
    </DocPage>
  );
}
