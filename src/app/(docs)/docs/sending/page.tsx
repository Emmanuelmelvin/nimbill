import type { Metadata } from "next";
import { CoinIcon } from "@/components/CoinIcon";
import { Callout, DocPage, H2 } from "@/components/docs/DocsParts";

export const metadata: Metadata = {
  title: "Sending the payment",
  description: "How to send a NimBill quote from a wallet: exact amount, right address, with the memo, in NIM or USDT on Polygon.",
};

export default function Sending() {
  return (
    <DocPage title="Sending the payment" description="Exact amount, right address, with the memo.">
      <p className="text-muted">The quote has everything a wallet needs. The rules differ a little between the two coins.</p>

      <H2 id="nim">
        <span className="inline-flex items-center gap-2">
          <CoinIcon coin="NIM" className="h-6 w-6" /> NIM (Nimiq)
        </span>
      </H2>
      <ul className="list-disc space-y-1.5 pl-5 text-muted">
        <li>
          Amounts are in Luna: <span className="font-mono text-ink">1 NIM = 100000</span>. Use integers, never floats.
        </li>
        <li>Send a basic transaction to quote.recipient with quote.memo as the data (UTF-8). The memo is how NimBill matches it.</li>
        <li>Paying more than the quote is accepted. Less is rejected.</li>
        <li>
          No wallet code? Hand the person this link, which any Nimiq wallet opens:
          <span className="mt-1 block font-mono text-xs break-all text-ink">nimiq:NQ16ADMA…FQE4?amount=752.66&amp;message=NimBill%2089mwch33sp</span>
        </li>
      </ul>

      <H2 id="usdt">
        <span className="inline-flex items-center gap-2">
          <CoinIcon coin="USDT" className="h-6 w-6" /> USDT (Polygon)
        </span>
      </H2>
      <ul className="list-disc space-y-1.5 pl-5 text-muted">
        <li>An ERC-20 transfer on Polygon to quote.recipient, with 6 decimals.</li>
        <li>The sending wallet needs a little POL for the network fee.</li>
        <li>It counts after 5 confirmations, a few seconds on Polygon.</li>
      </ul>
      <Callout type="warning" title="Don't round USDT amounts">
        <p>
          USDT can&apos;t carry a memo, so the <span className="font-semibold text-ink">exact amount</span> identifies the invoice. Each
          quote has a unique tail of up to 0.009999 USDT. Don&apos;t round it.
        </p>
      </Callout>

      <H2 id="timing">Send before the quote runs out</H2>
      <p className="text-muted">
        Send before <span className="font-mono text-ink">quote.expiresAt</span>. A payment broadcast just before the lock runs out still
        counts if it lands within 3 minutes. Otherwise, ask for a new quote.
      </p>
    </DocPage>
  );
}
