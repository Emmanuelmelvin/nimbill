import Link from "next/link";
import { Code } from "@/components/site/SiteShell";

const CREATE = `import { createHmac } from "node:crypto";

const body = JSON.stringify({
  payerName: "Grace Hopper",
  amount: 25,
  currency: "EUR",
  description: "Order #1042",
  reference: "order_1042",            // your own order id
  returnUrl: "https://shop.example/thanks",
});
const t = Math.floor(Date.now() / 1000);
const v1 = createHmac("sha256", process.env.NIMBILL_WEBHOOK_SECRET)
  .update(\`\${t}.\${body}\`)
  .digest("hex");

const res = await fetch("https://<nimbill>/api/pay/ada/invoices", {
  method: "POST",
  headers: { "content-type": "application/json", "NimBill-Signature": \`t=\${t},v1=\${v1}\` },
  body,
});
const { invoice } = await res.json();
// Send the customer to the invoice page to pay: /i/<invoice.id>`;

const WEBHOOK = `POST https://shop.example/nimbill-webhook
NimBill-Signature: t=1763112000,v1=5f2c…

{
  "id": "evt_…",
  "type": "invoice.paid",
  "data": {
    "invoice": {
      "reference": "order_1042",
      "status": "paid",
      "total": "25",
      "currency": "EUR",
      "payment": { "asset": "NIM", "txHash": "…", "paidAt": "…" }
    }
  }
}`;

/** Body of "Introducing Pay with NimBill". Rendered inside the blog's <Prose> column. */
export default function PayWithNimBill() {
  return (
    <>
      <p>
        Until now, a NimBill board was something a person visited: you shared <code>/pay/ada</code>, someone picked a product or typed an
        amount, and paid from their wallet. Today that same board can sit behind a checkout. <strong>Pay with NimBill</strong> lets an
        online store create invoices on its owner&apos;s board and hear back the moment one is paid.
      </p>

      <h2 id="how">How it works</h2>
      <ol>
        <li>
          In NimBill, open <strong>Settings → Webhooks</strong>, enter the URL where your store wants to be told about payments, and copy
          the webhook secret. It is shown once.
        </li>
        <li>
          At checkout, your store creates an invoice on your board with a request signed by that secret. It can attach its own order{" "}
          <code>reference</code>, a few <code>metadata</code> fields and a <code>returnUrl</code> to send the customer back to.
        </li>
        <li>The customer pays the invoice in NIM or USDT from their own wallet, as with any NimBill invoice.</li>
        <li>
          NimBill finds the payment on the blockchain, checks it, and sends your store an <code>invoice.paid</code> webhook, signed the same
          way. Your store marks the order paid.
        </li>
      </ol>

      <h2 id="no-api-key">No API key. One secret, both ways</h2>
      <p>
        We didn&apos;t want to add an API key to look after. The webhook secret already has to live on your server, so it does both jobs:
      </p>
      <ul>
        <li>
          <strong>Store → NimBill.</strong> Your store signs the invoices it creates. Only signed requests may set a reference, metadata or
          return URL, and only signed invoices send webhooks. Anonymous board payments work exactly as before.
        </li>
        <li>
          <strong>NimBill → store.</strong> Every webhook carries the same kind of signature, so your store knows it really came from
          NimBill.
        </li>
      </ul>
      <p>
        The signature is the <code>NimBill-Signature</code> header: a timestamp and an HMAC-SHA256 of the timestamp and the raw body.
        Requests more than five minutes old are refused, so a captured request can&apos;t be replayed later. To change the secret, make a
        new one in Settings: the old one keeps working for 24 hours, so your store can switch over without downtime.
      </p>

      <h2 id="create">Creating a signed invoice</h2>
      <p>A store needs a few lines of code and no SDK. In Node.js:</p>
      <Code label="Node.js · create an invoice">{CREATE}</Code>

      <h2 id="webhook">Receiving the webhook</h2>
      <p>
        When the invoice is paid, your webhook URL gets a POST like this. Check the signature against the raw body before you trust it, then
        look up the order by <code>reference</code>:
      </p>
      <Code label="What your store receives">{WEBHOOK}</Code>
      <p>
        Webhooks are delivered by a separate worker. If your store is down or answers with an error, it retries with growing delays. Every
        retry carries the same event <code>id</code>, so you can safely ignore duplicates. You can send yourself a test event from Settings
        at any time.
      </p>

      <h2 id="still-non-custodial">Still wallet to wallet</h2>
      <p>
        None of this changes where the money goes. The customer pays straight to your wallet; NimBill never holds it. The webhook is only
        sent after NimBill has read the transaction from the Nimiq or Polygon blockchain and checked the recipient, the amount and the memo,
        so &quot;paid&quot; means paid.
      </p>

      <h2 id="start">Get started</h2>
      <p>
        The full guide, with the request and webhook reference, is in the docs under <Link href="/docs/webhooks">Pay with NimBill</Link>.
        Questions or feedback: find me on <a href="https://x.com/mercichidi">X</a>.
      </p>
    </>
  );
}
