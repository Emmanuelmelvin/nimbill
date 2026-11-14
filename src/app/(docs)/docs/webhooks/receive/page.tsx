import type { Metadata } from "next";
import { headers } from "next/headers";
import { CodeGroup } from "@/components/docs/CodeGroup";
import { Callout, Code, DefinitionBox, DocPage, H2 } from "@/components/docs/DocsParts";
import { DELIVERY_HEADERS, paidPayload, receiveTabs } from "@/components/docs/webhook-snippets";
import { requestOrigin } from "@/lib/request-origin";
import { DELIVERY_TIMEOUT_S, MAX_ATTEMPTS, ROTATION_OVERLAP_HOURS, retryScheduleText } from "@/lib/webhook-policy";
import { SIGNATURE_TOLERANCE_S } from "@/lib/webhook-signature";

export const metadata: Metadata = {
  title: "Receive webhooks",
  description: "What NimBill sends your store when an invoice is paid, how to verify the signature, retries, duplicates and testing.",
};

const mono = "font-mono text-ink";

export default async function ReceiveWebhooks() {
  const base = requestOrigin(await headers());

  return (
    <DocPage title="Receive webhooks" description="What arrives, and how to trust it.">
      <H2 id="request">What you receive</H2>
      <p className="text-muted">
        A <span className={mono}>POST</span> with a JSON body to the URL saved in Settings → Webhooks:
      </p>
      <Code label="headers" copy={false}>
        {DELIVERY_HEADERS}
      </Code>
      <Code label="body · invoice.paid">{paidPayload(base)}</Code>
      <DefinitionBox
        title="Fields worth knowing"
        rows={[
          ["id", "string", "The event id. The same on every retry of this event: use it to skip duplicates."],
          ["test", "boolean", "true for events sent with Send test event. Never fulfil an order on a test event."],
          ["data.invoice.id", "string", "The invoice id you saved when you created it. Match your order on this."],
          [
            "data.invoice.total",
            "decimal string",
            "The invoice total in data.invoice.currency, without any tip. Check it against your order.",
          ],
          [
            "data.invoice.payment.amount",
            "integer string",
            "What arrived on-chain, in the smallest unit (Luna for NIM, 1 NIM = 100000; 6 decimals for USDT). Includes the tip.",
          ],
          ["data.invoice.payment.txHash", "string", "The transaction, for your records or a block explorer link."],
          ["data.invoice.reference, metadata", "", "What you sent when creating the invoice."],
          ["data.invoice.number", "string", "The merchant's invoice number (INV-…), given when it is paid."],
        ]}
      />

      <H2 id="events">Events</H2>
      <DefinitionBox
        title="Event types"
        rows={[
          ["invoice.paid", "", "An invoice your store created was paid and confirmed on-chain. Sent once per invoice."],
          ["webhook.test", "", "Sent from Settings → Webhooks, with a made-up paid invoice and test: true."],
        ]}
      />
      <p className="text-sm text-muted">More types may be added. Answer 2xx to types you don&apos;t handle, so they aren&apos;t retried.</p>

      <H2 id="verify">Verify the signature</H2>
      <p className="text-muted">Before trusting anything in the body:</p>
      <ol className="list-decimal space-y-1.5 pl-5 text-muted">
        <li>
          Read the <span className="text-ink">raw</span> request body. Parsing and re-serializing JSON changes bytes and breaks the
          signature.
        </li>
        <li>
          From <span className={mono}>NimBill-Signature</span>, take <span className={mono}>t</span> and every{" "}
          <span className={mono}>v1</span>. Refuse it if <span className={mono}>t</span> is more than {SIGNATURE_TOLERANCE_S / 60} minutes
          from your clock.
        </li>
        <li>
          Compute hex HMAC-SHA256 of <span className={mono}>&quot;&lt;t&gt;.&lt;raw body&gt;&quot;</span> with your secret, and accept the
          event if it equals <span className="text-ink">any</span> <span className={mono}>v1</span>. Compare in constant time.
        </li>
      </ol>
      <CodeGroup tabs={receiveTabs} />
      <Callout type="tip" title="Why more than one v1?">
        <p>
          After you make a new secret, the old one keeps working for {ROTATION_OVERLAP_HOURS} hours, and webhooks carry a signature from
          each. A handler that accepts any matching <span className="font-mono">v1</span> keeps working whichever secret it has.
        </p>
      </Callout>

      <H2 id="respond">Respond and retries</H2>
      <p className="text-muted">
        Answer with any <span className="text-ink">2xx</span> within {DELIVERY_TIMEOUT_S} seconds. Anything else (an error status, a
        timeout, a refused connection) counts as a failure and is retried after {retryScheduleText()}: {MAX_ATTEMPTS} attempts over about 3
        days. Then the event is marked failed. Recent events in Settings shows each event&apos;s status, how many attempts it took and the
        last answer your server gave.
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted">
        <li>Redirects are not followed: give the final https URL.</li>
        <li>URLs on private or local addresses are refused, so test with a public URL (a tunnel works).</li>
        <li>
          Turning webhooks off pauses delivery; events wait (up to 3 days) and go out when you turn them back on. Removing webhooks drops
          what&apos;s waiting.
        </li>
      </ul>

      <H2 id="duplicates">Duplicates and order</H2>
      <p className="text-muted">
        Delivery is <span className="text-ink">at least once</span>: if your server processed an event but the answer got lost, it comes
        again with the same <span className={mono}>id</span>. Record the ids you&apos;ve handled and skip repeats. Events may also arrive
        out of order; don&apos;t rely on their sequence, rely on the invoice&apos;s <span className={mono}>status</span>.
      </p>

      <H2 id="test">Test it</H2>
      <p className="text-muted">
        <span className={mono}>Send test event</span> in Settings → Webhooks sends a <span className={mono}>webhook.test</span> within a few
        seconds. For an end-to-end test, create a small signed invoice (a few cents) and pay it from Nimiq Pay: you&apos;ll get the real{" "}
        <span className={mono}>invoice.paid</span>, and the money stays yours.
      </p>

      <H2 id="rotate">Rotate the secret</H2>
      <p className="text-muted">
        <span className={mono}>New secret</span> in Settings shows a new secret once. For the next {ROTATION_OVERLAP_HOURS} hours both the
        new and the old one work, for your signed requests and for checking webhooks, so you can update your server without downtime. If a
        secret leaks, make a new one at once: payments always go to your wallet, so the worst a leaked secret allows is creating invoices in
        your store&apos;s name.
      </p>
    </DocPage>
  );
}
