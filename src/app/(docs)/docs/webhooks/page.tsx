import type { Metadata } from "next";
import Link from "next/link";
import { Callout, Card, Cards, DocPage, H2, Step, Steps, Tile } from "@/components/docs/DocsParts";
import { DELIVERY_TIMEOUT_S } from "@/lib/webhook-policy";

export const metadata: Metadata = {
  title: "Pay with NimBill",
  description:
    "Take NIM and USDT in your online store: create invoices from your server, customers pay straight into your wallet, and a signed webhook tells your store when each one is paid.",
};

const link = "underline underline-offset-4";

export default function Webhooks() {
  return (
    <DocPage title="Pay with NimBill" description="Take payments in your store, get a webhook when they land.">
      <p className="text-muted">
        Add NimBill as a payment option in your online store. Your server creates the invoice, the customer pays it from their wallet{" "}
        <strong className="text-ink">straight into yours</strong>, and NimBill sends your server a signed message the moment the payment is
        confirmed on-chain. NimBill never holds the money.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile title="No API key">One webhook secret signs both ways: your requests to NimBill, and NimBill&apos;s webhooks to you.</Tile>
        <Tile title="Non-custodial">Payments go wallet to wallet. A leaked secret can only create invoices that pay you.</Tile>
        <Tile title="NIM and USDT">Prices in your currency (USD, NGN, EUR…), paid in NIM or USDT on Polygon at a locked rate.</Tile>
      </div>

      <H2 id="how">How it works</H2>
      <Steps>
        <Step n={1} title="Your server creates the invoice.">
          <p>
            It calls{" "}
            <Link href="/docs/webhooks/create" className={link}>
              POST /api/pay/&#123;tag&#125;/invoices
            </Link>{" "}
            on your own board, signed with your webhook secret, with the amount, your order id and where to send the customer afterwards.
            Save the <span className="font-mono">invoice.id</span> it returns with the order.
          </p>
        </Step>
        <Step n={2} title="The customer pays on NimBill.">
          <p>
            Redirect them to <span className="font-mono">/i/&#123;invoice.id&#125;</span>. They lock a price and pay from Nimiq Pay or any
            wallet. Afterwards a <strong className="text-ink">Back to your shop</strong> button takes them to your{" "}
            <span className="font-mono">returnUrl</span>.
          </p>
        </Step>
        <Step n={3} title="NimBill confirms the payment on-chain.">
          <p>Even if the customer closes the tab, NimBill keeps watching the blockchain for the payment.</p>
        </Step>
        <Step n={4} title="Your server gets an invoice.paid webhook.">
          <p>
            Signed, retried for about 3 days until you answer with a 2xx within {DELIVERY_TIMEOUT_S} seconds. See{" "}
            <Link href="/docs/webhooks/receive" className={link}>
              Receive webhooks
            </Link>
            .
          </p>
        </Step>
      </Steps>

      <H2 id="setup">Set it up</H2>
      <Steps>
        <Step n={1} title="Get a tag.">
          <p>
            Sign in to NimBill with Nimiq Pay and claim a tag such as <span className="font-mono">ada@nimbill</span>. Your store creates
            invoices on that board. To accept USDT too, add a Polygon address in Settings.
          </p>
        </Step>
        <Step n={2} title="Turn on webhooks.">
          <p>
            In <span className="font-mono">Settings → Webhooks</span>, enter the https URL that receives webhooks and, optionally, your
            store&apos;s address (where customers may be sent back to). Copy the secret it shows. It is shown only once; you can make a new
            one any time.
          </p>
        </Step>
        <Step n={3} title="Store the secret on your server.">
          <p>
            For example as <span className="font-mono">NIMBILL_WEBHOOK_SECRET</span>. Never put it in a web page or an app: whoever has it
            can create invoices in your store&apos;s name.
          </p>
        </Step>
        <Step n={4} title="Send a test event.">
          <p>
            <span className="font-mono">Send test event</span> in Settings delivers a <span className="font-mono">webhook.test</span> with a
            made-up paid invoice, so you can check your handler without paying anything.
          </p>
        </Step>
      </Steps>

      <H2 id="rules">Three rules</H2>
      <Callout type="warning" title="Match on the invoice id, and check the amount">
        <p>
          Creating a board invoice doesn&apos;t need a secret, so anyone can make one on your board. Only invoices your server created with
          a signature send webhooks, but your handler should still find the order by the <span className="font-mono">invoice.id</span> you
          saved, and check <span className="font-mono">total</span> and <span className="font-mono">currency</span> before shipping.{" "}
          <span className="font-mono">reference</span> is your own label, not proof.
        </p>
      </Callout>
      <ul className="list-disc space-y-1.5 pl-5 text-muted">
        <li>
          <strong className="text-ink">Verify every signature</strong> before trusting a webhook, using the raw request body.
        </li>
        <li>
          <strong className="text-ink">Expect duplicates.</strong> Delivery is at least once: skip events whose{" "}
          <span className="font-mono">id</span> you already handled.
        </li>
        <li>
          <strong className="text-ink">Answer fast.</strong> Return 2xx right away and do slow work (emails, fulfilment) afterwards.
        </li>
      </ul>

      <H2 id="next">Next</H2>
      <Cards>
        <Card href="/docs/webhooks/create" title="Create a signed invoice">
          Sign the request, the extra fields, code in JavaScript, Python and PHP.
        </Card>
        <Card href="/docs/webhooks/receive" title="Receive webhooks">
          What arrives, verifying it, retries, testing and rotating the secret.
        </Card>
      </Cards>
    </DocPage>
  );
}
