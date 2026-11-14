import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { CodeGroup } from "@/components/docs/CodeGroup";
import { Callout, Code, DocPage, H2, Step, Steps } from "@/components/docs/DocsParts";
import { requestTabs } from "@/components/docs/snippets";
import { requestOrigin } from "@/lib/request-origin";

export const metadata: Metadata = {
  title: "Quick start",
  description: "Buy a product from a NimBill board with five HTTP requests: read, invoice, quote, pay, confirm.",
};

export default async function QuickStart() {
  const base = requestOrigin(await headers());

  return (
    <DocPage title="Quick start" description="Buy a product with curl.">
      <p className="text-muted">
        Try it against any board. Replace <span className="font-mono text-ink">ada</span> with a real tag (the part before @nimbill), and
        the ids with the ones you get back.
      </p>

      <H2 id="curl">Buy a product with curl</H2>
      <Steps>
        <Step n={1} title="Read the board.">
          <p>
            Note a product <span className="font-mono">id</span>, or check <span className="font-mono">merchant.openAmounts</span> if you
            want to pay any amount.
          </p>
          <CodeGroup tabs={requestTabs("GET", `${base}/api/pay/ada`)} />
        </Step>
        <Step n={2} title="Create the invoice.">
          <p>
            You get back <span className="font-mono">invoice.id</span> and the total.
          </p>
          <CodeGroup
            tabs={requestTabs("POST", `${base}/api/pay/ada/invoices`, {
              productId: "PRODUCT_ID",
              quantity: 1,
              payerName: "Shop bot for Tunde",
            })}
          />
        </Step>
        <Step n={3} title="Lock the price.">
          <p>The quote says exactly how much to send, where, with which memo, and until when.</p>
          <CodeGroup tabs={requestTabs("POST", `${base}/api/invoices/INVOICE_ID/quote`, { asset: "NIM" })} />
        </Step>
        <Step n={4} title="Pay.">
          <p>
            Send <span className="font-mono">quote.amount</span> Luna to <span className="font-mono">quote.recipient</span> with{" "}
            <span className="font-mono">quote.memo</span> as data (see{" "}
            <Link href="/docs/sending" className="underline underline-offset-4">
              Sending the payment
            </Link>
            ). Or open the invoice link and pay in Nimiq Pay:
          </p>
          <Code label="link" copy={false}>{`${base}/i/INVOICE_ID`}</Code>
        </Step>
        <Step n={5} title="Confirm.">
          <p>
            Repeat every few seconds while the answer is <span className="font-mono">&quot;pending&quot;</span>.
          </p>
          <CodeGroup tabs={requestTabs("POST", `${base}/api/invoices/INVOICE_ID/verify`, { asset: "NIM", txHash: "TX_HASH" })} />
        </Step>
      </Steps>

      <Callout type="tip">
        <p>
          A board&apos;s own JSON (<span className="font-mono">howToPay</span>) lists these same steps with its URLs filled in, so an agent
          that reads the board first can follow them from there.
        </p>
      </Callout>

      <H2 id="javascript">The same in JavaScript</H2>
      <p className="text-muted">For your own agent or backend:</p>
      <Code label="pay-board.mjs">{`const base = "${base}";
const post = (path, body) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error.message); return j; });

const board = await fetch(\`\${base}/api/pay/ada\`).then((r) => r.json());
const { invoice } = await post("/api/pay/ada/invoices", {
  productId: board.products[0].id, quantity: 1, payerName: "My agent for Tunde",
});
const { quote } = await post(\`/api/invoices/\${invoice.id}/quote\`, { asset: "NIM" });

// Send BigInt(quote.amount) Luna to quote.recipient with quote.memo as data, before quote.expiresAt,
// using your wallet library. Then:
const txHash = await sendNim(quote); // your code

let result;
do {
  await new Promise((r) => setTimeout(r, 3000));
  result = await post(\`/api/invoices/\${invoice.id}/verify\`, { asset: "NIM", txHash });
} while (result.status === "pending");
console.log(result.status, result.invoice?.number); // "paid", "INV-0042"`}</Code>
    </DocPage>
  );
}
