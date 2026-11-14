import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { CodeGroup } from "@/components/docs/CodeGroup";
import { Callout, Code, DefinitionBox, DocPage, Fields, H2 } from "@/components/docs/DocsParts";
import { endpointHref } from "@/components/docs/nav";
import { createInvoiceTabs } from "@/components/docs/webhook-snippets";
import { ENDPOINTS } from "@/lib/api-reference";
import { requestOrigin } from "@/lib/request-origin";
import { ANON_INVOICES_PER_IP_PER_MIN, BOARD_INVOICES_PER_10_MIN, STORE_INVOICES_PER_10_MIN } from "@/lib/webhook-policy";
import { SIGNATURE_TOLERANCE_S } from "@/lib/webhook-signature";

export const metadata: Metadata = {
  title: "Create a signed invoice",
  description: "Create NimBill invoices from your store's server with a NimBill-Signature header, and send the customer to pay.",
};

const link = "underline underline-offset-4";
const STORE_FIELDS = new Set(["reference", "metadata", "returnUrl"]);

export default async function CreateSignedInvoice() {
  const base = requestOrigin(await headers());
  const endpoint = ENDPOINTS.find((e) => e.id === "createBoardInvoice")!;
  const fields = endpoint.body ?? [];

  return (
    <DocPage title="Create a signed invoice" description="From your store's server, when the customer checks out.">
      <p className="text-muted">
        It&apos;s the same call any visitor or agent uses to pay your board,{" "}
        <Link href={endpointHref(endpoint.id)} className={link}>
          POST /api/pay/&#123;tag&#125;/invoices
        </Link>
        , plus one header. The signature proves the request came from your store, so NimBill accepts your order details and sends you
        webhooks for the invoice.
      </p>

      <H2 id="sign">Sign the request</H2>
      <ol className="list-decimal space-y-1.5 pl-5 text-muted">
        <li>
          Serialize the JSON body to a string <span className="text-ink">once</span>, and send exactly that string.
        </li>
        <li>
          Take the current Unix time in seconds, <span className="font-mono text-ink">t</span>.
        </li>
        <li>
          Compute HMAC-SHA256 of <span className="font-mono text-ink">&quot;&lt;t&gt;.&lt;body&gt;&quot;</span>, keyed with your whole
          webhook secret (including <span className="font-mono text-ink">whsec_</span>), as lowercase hex.
        </li>
        <li>Send it in the header below, with a fresh timestamp for every request.</li>
      </ol>
      <Code label="header" copy={false}>{`NimBill-Signature: t=1763116731,v1=9c1e4f…(64 hex characters)`}</Code>
      <Callout type="note">
        <p>
          NimBill refuses a signature whose <span className="font-mono">t</span> is more than {SIGNATURE_TOLERANCE_S / 60} minutes away from
          its clock, so a captured request can&apos;t be replayed later. Keep your server&apos;s clock synced. The same format signs the
          webhooks NimBill sends you.
        </p>
      </Callout>

      <H2 id="fields">Body</H2>
      <p className="text-muted">
        Every field of the{" "}
        <Link href={endpointHref(endpoint.id)} className={link}>
          normal request
        </Link>
        : a <span className="font-mono text-ink">productId</span> from your board, or an <span className="font-mono text-ink">amount</span>,{" "}
        <span className="font-mono text-ink">currency</span> and <span className="font-mono text-ink">description</span> (your board must
        accept any amount for that). Signed requests may also send:
      </p>
      <Fields title="Signed requests only" fields={fields.filter((f) => STORE_FIELDS.has(f.name))} />
      <p className="text-sm text-muted">
        <span className="font-mono text-ink">reference</span> and <span className="font-mono text-ink">metadata</span> are private to you
        and NimBill: they never appear on the public invoice page. <span className="font-mono text-ink">returnUrl</span> must be on the
        store address saved in Settings → Webhooks, so nobody can use your invoices to send customers to another site.
      </p>

      <H2 id="code">Code</H2>
      <p className="text-muted">Runs on your server when the customer picks &quot;Pay with NimBill&quot; at checkout:</p>
      <CodeGroup tabs={createInvoiceTabs(base)} />

      <H2 id="send">Send the customer to pay</H2>
      <p className="text-muted">
        Redirect them to the invoice page (or show it in a new tab). It shows your name, the items and the total in your currency, locks a
        price in NIM or USDT, and opens their wallet:
      </p>
      <Code label="redirect to">{`${base}/i/{invoice.id}`}</Code>
      <p className="text-muted">
        When the payment is confirmed the page says so and shows a <strong className="text-ink">Back to {"<your store>"}</strong> button
        that opens your <span className="font-mono text-ink">returnUrl</span>. Don&apos;t treat the customer arriving there as proof of
        payment: wait for the webhook, or check the invoice yourself with{" "}
        <Link href={endpointHref("getInvoice")} className={link}>
          GET /api/invoices/&#123;id&#125;
        </Link>
        .
      </p>

      <H2 id="errors">When it goes wrong</H2>
      <DefinitionBox
        title="Errors specific to signed requests"
        rows={[
          [
            "401 UNAUTHORIZED",
            "signature doesn't match",
            "The body you sent isn't byte-for-byte the string you signed, or the secret is wrong (an old one after the 24-hour overlap, say).",
          ],
          [
            "401 UNAUTHORIZED",
            "timestamp off",
            `t is more than ${SIGNATURE_TOLERANCE_S / 60} minutes from NimBill's clock. Sign each request right before sending it.`,
          ],
          ["401 UNAUTHORIZED", "webhooks off", "Webhooks are turned off or removed in Settings, so signed requests are refused."],
          ["400 BAD_REQUEST", "unsigned extras", "reference, metadata or returnUrl were sent without a NimBill-Signature header."],
          ["400 VALIDATION", "returnUrl", "returnUrl isn't on the store address saved in Settings, or no store address is saved."],
        ]}
      />
      <p className="text-sm text-muted">
        A wrong signature is always an error, never quietly treated as an anonymous request, so a misconfigured store finds out on its first
        try instead of silently missing webhooks.
      </p>

      <H2 id="limits">Rate limits</H2>
      <p className="text-muted">
        Your store has its own allowance of <span className="text-ink">{STORE_INVOICES_PER_10_MIN} invoices per 10 minutes</span>, apart
        from everyone else&apos;s, so traffic on your public board can&apos;t block your checkout. (Unsigned requests share{" "}
        {BOARD_INVOICES_PER_10_MIN} per board per 10 minutes, and {ANON_INVOICES_PER_IP_PER_MIN} per minute per IP address.) Every answer
        says where you stand:
      </p>
      <Code label="response headers" copy={false}>{`RateLimit-Limit: ${STORE_INVOICES_PER_10_MIN}
RateLimit-Remaining: 287
RateLimit-Reset: 412        seconds until the window frees up
Retry-After: 412            only on 429 Too Many Requests`}</Code>
    </DocPage>
  );
}
