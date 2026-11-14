import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocPage, H2 } from "@/components/docs/DocsParts";
import { cx } from "@/components/ui";

export const metadata: Metadata = {
  title: "How payments work",
  description: "Every NimBill payment is five calls and one blockchain check: read, invoice, quote, send, verify.",
};

export default function HowItWorks() {
  return (
    <DocPage title="How payments work" description="Five calls, one blockchain check.">
      <p className="text-muted">
        Every payment, from a person or a program, goes through the same steps. The only part NimBill can&apos;t do for you is sign the
        transaction: that happens in a wallet.
      </p>

      <H2 id="steps">Five calls, one blockchain check</H2>
      <ol className="grid border border-ink sm:grid-cols-5">
        {[
          ["Read", "GET the board: who, what, which coins."],
          ["Invoice", "POST what you're paying for."],
          ["Quote", "Lock the exact coin amount for 5 minutes."],
          ["Send", "Your wallet sends it, with the memo."],
          ["Verify", "NimBill checks the chain. Paid."],
        ].map(([t, d], i) => (
          <li key={t} className={cx("relative p-4", i > 0 && "border-t border-line sm:border-t-0 sm:border-l", i === 3 && "bg-subtle")}>
            <span className="font-mono text-[11px] text-muted">{String(i + 1).padStart(2, "0")}</span>
            <p className="mt-1 font-bold">{t}</p>
            <p className="mt-1 text-xs text-muted">{d}</p>
            {i === 3 && <p className="mt-2 font-mono text-[10px] tracking-wider uppercase">In a wallet</p>}
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted">
        Each call has its own page under{" "}
        <Link href="/docs/api" className="underline underline-offset-4">
          Board API
        </Link>
        , and the{" "}
        <Link href="/docs/quick-start" className="underline underline-offset-4">
          quick start
        </Link>{" "}
        runs all five.
      </p>

      <H2 id="verify">Why a separate verify step?</H2>
      <p className="text-muted">
        A transaction hash on its own proves nothing. NimBill reads the transaction from a Nimiq or Polygon node and checks the recipient,
        the amount, the memo and the time before it marks an invoice paid. Each transaction can pay only one invoice.
      </p>

      <H2 id="two-ways">Two ways to pay</H2>
      <p className="text-muted">
        Hand the payment to a person to approve in their wallet, or let a program with its own wallet pay on its own. Most AI assistants
        can&apos;t hold money, so they hand off.
      </p>
      <Callout type="note" title="Paying from an AI assistant or agent?">
        <p>
          Both patterns, hand-off and autonomous, are explained step by step in{" "}
          <Link href="/ai#two-ways" className="font-semibold text-ink underline underline-offset-4">
            How an AI pays with NimBill
          </Link>
          .
        </p>
      </Callout>
    </DocPage>
  );
}
