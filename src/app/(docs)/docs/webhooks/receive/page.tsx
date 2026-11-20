import type { Metadata } from "next";
import { headers } from "next/headers";
import { CodeGroup } from "@/components/docs/CodeGroup";
import { Callout, Code, DefinitionBox, DocPage, H2 } from "@/components/docs/DocsParts";
import { DELIVERY_HEADERS, issuePayload, paidPayload, receiveTabs } from "@/components/docs/webhook-snippets";
import { requestOrigin } from "@/lib/request-origin";
import {
  DELIVERY_TIMEOUT_S,
  FAILING_MIN_ATTEMPTS,
  FAILING_REMOVE_AFTER_DAYS,
  FAILING_WARN_AFTER_HOURS,
  MAX_ATTEMPTS,
  REMOVAL_NOTICE_HOURS,
  ROTATION_OVERLAP_HOURS,
  STORE_INVOICE_EXPIRY_DEFAULT_MIN,
  STORE_INVOICE_EXPIRY_MAX_MIN,
  STORE_INVOICE_EXPIRY_MIN_MIN,
  WATCH_AFTER_LOCK_MIN,
  retryScheduleText,
} from "@/lib/webhook-policy";
import { SIGNATURE_TOLERANCE_S } from "@/lib/webhook-signature";

export const metadata: Metadata = {
  title: "Receive webhooks",
  description:
    "What NimBill sends your store when an invoice is paid, expires or gets a payment it can't accept, how to verify the signature, retries, what happens when your URL keeps failing, duplicates and testing.",
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
          [
            "invoice.expired",
            "",
            "An invoice your store created wasn't paid in time and can no longer be paid. Release the stock. Sent once per invoice.",
          ],
          [
            "invoice.payment_issue",
            "NIM only",
            "NIM for one of your invoices arrived but didn't pay it: too little, too late, or a second payment. Sent once per transaction.",
          ],
          ["webhook.test", "", "Sent from Settings → Webhooks, with a made-up paid invoice and test: true."],
        ]}
      />
      <p className="text-muted">
        <strong className="text-ink">Pick the ones you want</strong> under <span className={mono}>Events to receive</span> in Settings →
        Webhooks. All three are on for a new endpoint. Events you untick are never sent, so they can&apos;t fail or count against your URL;
        one that was already waiting when you unticked it is dropped, and Recent events says why. <span className={mono}>webhook.test</span>{" "}
        is always sent when you ask for it.
      </p>
      <p className="text-sm text-muted">
        More types may be added; you&apos;ll choose whether to receive them. Answer 2xx to types you don&apos;t handle, so they aren&apos;t
        retried.
      </p>

      <H2 id="expired">Expired invoices</H2>
      <p className="text-muted">
        Every invoice your store creates can be paid for {STORE_INVOICE_EXPIRY_DEFAULT_MIN / 60} hours, or for{" "}
        <span className={mono}>expiresInMinutes</span> if you set it when creating it ({STORE_INVOICE_EXPIRY_MIN_MIN} minutes to{" "}
        {STORE_INVOICE_EXPIRY_MAX_MIN / 60 / 24} days). The time is in <span className={mono}>data.invoice.expiresAt</span>.
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted">
        <li>
          After <span className={mono}>expiresAt</span>, nobody can lock a new price, so nobody can start paying.
        </li>
        <li>
          A customer who locked a price just before then can still finish. NimBill waits until no price lock can be paid any more (up to{" "}
          {WATCH_AFTER_LOCK_MIN} minutes after the last one ended), checks the blockchain one last time, and only then marks the invoice{" "}
          <span className={mono}>expired</span> and sends <span className={mono}>invoice.expired</span>.
        </li>
        <li>
          So an invoice ends up either <span className={mono}>paid</span> or <span className={mono}>expired</span>, never both. You
          won&apos;t get <span className={mono}>invoice.paid</span> after <span className={mono}>invoice.expired</span> for the same
          invoice.
        </li>
      </ul>
      <Callout type="tip" title="Hold stock until you hear back">
        <p>
          Keep the order reserved until <span className={mono}>invoice.paid</span> or <span className={mono}>invoice.expired</span> arrives,
          not just until <span className={mono}>expiresAt</span>: the customer may be finishing a payment they started in time.
        </p>
      </Callout>

      <H2 id="payment-issues">Payment issues</H2>
      <p className="text-muted">
        A NIM payment carries the invoice&apos;s reference, so NimBill knows which invoice it was meant for even when it doesn&apos;t pay
        it. The money is already in your wallet: NimBill can&apos;t send it back, so this event is your cue to sort it out with the customer
        (ask for the rest, refund it, or accept it).
      </p>
      <Code label="body · invoice.payment_issue">{issuePayload(base)}</Code>
      <DefinitionBox
        title="data.issue.reason"
        rows={[
          [
            "amount_too_low",
            "",
            "Sent while a price was locked, but less than it. lockedAmount is the price it fell short of. The invoice stays unpaid.",
          ],
          ["price_lock_expired", "", "Sent when no price was locked: too long after the lock ran out, or without locking one."],
          ["already_paid", "", "The invoice was already paid by another transaction. This is a second payment."],
          ["invoice_closed", "", "The invoice had expired or been cancelled before this payment."],
        ]}
      />
      <DefinitionBox
        title="Other fields in data.issue"
        rows={[
          ["amount", "integer string", "What arrived, in Luna (1 NIM = 100000)."],
          ["lockedAmount", "integer string | null", "The locked price in Luna (amount_too_low only)."],
          ["txHash, from, sentAt", "string", "The transaction, the wallet it came from, and when it was sent."],
        ]}
      />
      <p className="text-sm text-muted">
        NimBill looks for these from when a price is locked until {WATCH_AFTER_LOCK_MIN} minutes after the lock ends, and whenever a
        payer&apos;s wallet hands in a transaction. USDT has no reference, so a USDT transfer that doesn&apos;t match a locked price
        can&apos;t be tied to an invoice and isn&apos;t reported.
      </p>

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
        last answer your server gave (see <a href="#look-up">Look up an event</a>).
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted">
        <li>Redirects are not followed: give the final https URL.</li>
        <li>URLs on private or local addresses are refused, so test with a public URL (a tunnel works).</li>
        <li>
          Turning webhooks off pauses delivery; events wait (up to 3 days) and go out when you turn them back on. Removing webhooks drops
          what&apos;s waiting.
        </li>
      </ul>

      <H2 id="failing">When your URL keeps failing</H2>
      <p className="text-muted">
        NimBill watches your URL as a whole, not just single events. What counts is how long every delivery has failed in a row. One slow
        hour on a busy store doesn&apos;t, and any webhook that gets a 2xx clears it all.
      </p>
      <ol className="list-decimal space-y-1.5 pl-5 text-muted">
        <li>
          <span className="text-ink">Failing.</span> As soon as a delivery fails, Settings → Webhooks says so, and the card shows{" "}
          <span className="text-ink">Failing</span>.
        </li>
        <li>
          <span className="text-ink">Warning, after {FAILING_WARN_AFTER_HOURS} hours.</span> Once every delivery has failed for{" "}
          {FAILING_WARN_AFTER_HOURS} hours (at least {FAILING_MIN_ATTEMPTS} attempts in a row), you get an email and a notice on your
          dashboard with the date webhooks will be removed.
        </li>
        <li>
          <span className="text-ink">Removal, after {FAILING_REMOVE_AFTER_DAYS} days.</span> If it&apos;s still failing{" "}
          {FAILING_REMOVE_AFTER_DAYS} days after the first failure, and at least {REMOVAL_NOTICE_HOURS} hours after the warning, webhooks
          are removed. You get a second email, and Settings and the dashboard say so. Your store stops getting webhooks, and its signed
          requests are refused until you turn them back on. Payments to your board still reach your wallet.
        </li>
      </ol>
      <p className="text-muted">
        To turn webhooks back on, fix your server and press <span className={mono}>Save</span> in Settings → Webhooks. Your secret stays the
        same. Saving a new URL also starts the count over. The emails go to the address saved in Settings; without one you&apos;ll only see
        the notices in the app.
      </p>

      <H2 id="look-up">Look up an event</H2>
      <p className="text-muted">
        <span className={mono}>Settings → Webhooks</span> (tagged <span className="text-ink">For developers</span>) lists your 20 most
        recent events under <span className="text-ink">Recent events</span>. Open one to see:
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted">
        <li>
          Its <span className={mono}>id</span> (the same as the <span className={mono}>NimBill-Event-Id</span> header, so you can find it in
          your server&apos;s logs), its type and the invoice it is about.
        </li>
        <li>Its status, how many attempts it took, when it was created and delivered, and when the next retry is due.</li>
        <li>The last HTTP status your server answered with, or the error, such as a timeout or a refused connection.</li>
        <li>
          The JSON body your server is sent. Bodies aren&apos;t stored: an <span className={mono}>invoice.*</span> body is built from the
          invoice as it is now, the same way the delivery builds it, and a <span className={mono}>webhook.test</span> body is exactly what
          was sent.
        </li>
      </ul>
      <p className="text-muted">
        Events are only shown to you when you&apos;re signed in to NimBill. Your store can&apos;t list them with the webhook secret.
      </p>

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
