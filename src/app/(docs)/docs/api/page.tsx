import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Callout, Card, Cards, Code, DocPage, H2, MethodBadge } from "@/components/docs/DocsParts";
import { endpointHref } from "@/components/docs/nav";
import { TextLink } from "@/components/ui";
import { ENDPOINTS } from "@/lib/api-reference";
import { requestOrigin } from "@/lib/request-origin";

export const metadata: Metadata = {
  title: "Board API",
  description: "Every public NimBill endpoint: read a board, create an invoice, lock the price, confirm the payment.",
};

export default async function ApiOverview() {
  const base = requestOrigin(await headers());

  return (
    <DocPage title="Board API" description="Every public endpoint.">
      <p className="text-muted">
        JSON in and out, no API key. These are the calls behind every payment, from a person or a program. Machine-readable:{" "}
        <TextLink href="/openapi.json">openapi.json</TextLink>.
      </p>
      <Callout type="tip" title="Taking payments in your own store?">
        <p>
          Sign your invoice requests with your webhook secret and NimBill will send your server a webhook when each one is paid. See{" "}
          <Link href="/docs/webhooks" className="text-ink underline underline-offset-4">
            Pay with NimBill
          </Link>
          .
        </p>
      </Callout>

      <H2 id="base-url">Base URL</H2>
      <Code label="Base URL">{base}</Code>

      <H2 id="errors">Errors</H2>
      <p className="text-muted">
        Errors are <span className="font-mono text-ink">{"{ error: { code, message } }"}</span> with a matching HTTP status; the message is
        safe to show a person. Each endpoint&apos;s page lists the errors it can return.
      </p>

      <H2 id="rate-limits">Rate limits</H2>
      <p className="text-muted">
        Endpoints that start something (an invoice, a quote) are limited, and their answers say where you stand. The headers can be read
        from browsers on other sites too. On a <span className="font-mono text-ink">429</span>, wait{" "}
        <span className="font-mono text-ink">Retry-After</span> seconds.
      </p>
      <Code label="response headers" copy={false}>{`RateLimit-Limit: 30          requests allowed in the window
RateLimit-Remaining: 12      left after this one
RateLimit-Reset: 412         seconds until the window frees up
Retry-After: 412             only on 429 Too Many Requests`}</Code>

      <H2 id="endpoints">Endpoints</H2>
      <ul className="divide-y divide-line border border-ink">
        {ENDPOINTS.map((e) => (
          <li key={e.id}>
            <Link href={endpointHref(e.id)} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-subtle">
              <MethodBadge method={e.method} />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{e.path}</span>
              <span className="hidden text-sm text-muted sm:inline">{e.summary}</span>
            </Link>
          </li>
        ))}
      </ul>

      <H2 id="machine-readable">Machine-readable</H2>
      <Cards cols={3}>
        <Card href="/openapi.json" title="openapi.json">
          OpenAPI 3.1 for tools and code generators
        </Card>
        <Card href="/llms.txt" title="llms.txt">
          Plain-text guide for language models
        </Card>
        <Card href="/skill.md" title="skill.md">
          The agent skill as a file
        </Card>
      </Cards>
    </DocPage>
  );
}
