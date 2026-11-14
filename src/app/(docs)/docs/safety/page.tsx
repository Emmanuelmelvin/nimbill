import type { Metadata } from "next";
import Link from "next/link";
import { Callout, CtaBox, DocPage, H2 } from "@/components/docs/DocsParts";
import { LinkButton } from "@/components/ui";
import { AGENT_RULES } from "@/lib/agent-docs";

export const metadata: Metadata = {
  title: "Safety and limits",
  description: "What to check before an agent sends money with NimBill, and the limits and guarantees of the public API.",
};

export default function Safety() {
  return (
    <DocPage title="Safety and limits" description="Money moves for real.">
      <H2 id="agents">For anyone building an agent</H2>
      <Callout type="warning" title="Get a clear yes before money moves">
        <p>Show the person the merchant&apos;s name and handle, what it&apos;s for and the exact amount, and get a clear yes.</p>
      </Callout>
      <ul className="list-disc space-y-1.5 pl-5 text-muted">
        <li>Give agents a spending limit, and a wallet that holds only what they may spend.</li>
        <li>Never ask anyone for a seed phrase or private key. Hand off with a link instead.</li>
        <li>Check the tag (GET /api/tags/&#123;tag&#125;): lookalike tags exist.</li>
      </ul>

      <H2 id="limits">Limits and guarantees</H2>
      <ul className="list-disc space-y-1.5 pl-5 text-muted">
        {AGENT_RULES.map((r) => (
          <li key={r}>{r}</li>
        ))}
        <li>Quotes last 5 minutes. Unpaid board invoices disappear from the merchant&apos;s view after 7 days.</li>
      </ul>

      <div className="pt-6">
        <CtaBox
          title="Want to be paid this way?"
          text="Claim a tag and your board is live in a minute."
          action={
            <LinkButton href="/" variant="secondary" className="border-paper">
              Get your tag
            </LinkButton>
          }
        />
      </div>
      <p className="text-xs text-muted">
        Questions or something missing? See{" "}
        <Link href="/stats" className="underline underline-offset-4">
          payments made with NimBill
        </Link>{" "}
        to watch it work.
      </p>
    </DocPage>
  );
}
