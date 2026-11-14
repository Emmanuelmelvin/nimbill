import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CodeGroup } from "@/components/docs/CodeGroup";
import { Code, DocPage, Fields, H2, MethodBadge } from "@/components/docs/DocsParts";
import { endpointSlug } from "@/components/docs/nav";
import { exampleUrl, requestTabs } from "@/components/docs/snippets";
import { CopyButton } from "@/components/ui";
import { ENDPOINTS } from "@/lib/api-reference";
import { requestOrigin } from "@/lib/request-origin";

// One page per public endpoint, all made from ENDPOINTS in api-reference.ts (which also feeds
// /openapi.json), so a new endpoint gets its page on its own.

const find = (slug: string) => ENDPOINTS.find((e) => endpointSlug(e.id) === slug);

export async function generateMetadata({ params }: PageProps<"/docs/api/[endpoint]">): Promise<Metadata> {
  const e = find((await params).endpoint);
  return e ? { title: `${e.summary} (${e.method} ${e.path})`, description: e.why } : {};
}

export default async function EndpointPage({ params }: PageProps<"/docs/api/[endpoint]">) {
  const e = find((await params).endpoint);
  if (!e) notFound();
  const base = requestOrigin(await headers());
  const url = exampleUrl(base, e);

  return (
    <DocPage title={e.summary} description={e.why}>
      {/* The endpoint itself, as Mintlify shows it: method, then the full URL to copy. */}
      <div className="flex items-stretch border border-ink">
        <span className="flex items-center border-r border-ink px-3">
          <MethodBadge method={e.method} />
        </span>
        <span className="flex min-w-0 flex-1 items-center px-3 py-2.5 font-mono text-sm font-semibold break-all">
          <span className="text-muted">{base}</span>
          {e.path}
        </span>
        <CopyButton text={base + e.path} size="sm" variant="ghost" className="min-h-11 shrink-0 border-l border-ink" />
      </div>

      {e.params && (
        <>
          <H2 id="path">Path parameters</H2>
          <Fields title="Path" fields={e.params} />
        </>
      )}
      {e.query && (
        <>
          <H2 id="query">Query parameters</H2>
          <Fields title="Query" fields={e.query} />
        </>
      )}
      {e.body && (
        <>
          <H2 id="body">Body</H2>
          <Fields title="Body (JSON)" fields={e.body} />
        </>
      )}

      <H2 id="request">Request</H2>
      <CodeGroup title="Example request" tabs={requestTabs(e.method, url, e.example.request)} />

      <H2 id="response">Response</H2>
      <Code label="Example response · 200">{JSON.stringify(e.example.response, null, 2)}</Code>

      <H2 id="errors">When it goes wrong</H2>
      <ul className="divide-y divide-line border border-line font-mono text-xs text-muted">
        {e.errors.map((er) => (
          <li key={er} className="px-3 py-2">
            {er}
          </li>
        ))}
      </ul>
    </DocPage>
  );
}
