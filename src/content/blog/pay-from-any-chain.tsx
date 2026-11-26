import Link from "next/link";
import { PayinCoinIcon } from "@/components/PayFromOtherChain";
import { Notice } from "@/components/site/SiteShell";
import { CoinText } from "@/components/ui";
import { PAYIN_SOURCES } from "@/lib/payin/sources";

const STABLES = PAYIN_SOURCES.filter((s) => s.kind === "stable");
const NATIVES = PAYIN_SOURCES.filter((s) => s.kind === "native");

/** Body of "Pay from any chain: let clients pay from the wallet they already use". */
export default function PayFromAnyChain() {
  return (
    <>
      <p>
        Sending an invoice across borders used to fail at the very last step. You finish the job, write a clean invoice in your local
        currency, send the link over WhatsApp or email, and get the reply every crypto freelancer has seen:{" "}
        <em>&quot;I don&apos;t have that wallet. Can I just send you USDT on Tron? Or BTC from Binance? Or SOL from Phantom?&quot;</em>
      </p>
      <p>
        <CoinText>
          For you as the freelancer or business owner, Nimiq Pay is home: your invoices, pay boards, staking, receipts, and withdrawals all
          live there, and payments land straight in your wallet as NIM or USDT. Asking every new client to install a new wallet just to pay
          one invoice, however, adds friction right when they are ready to pay you.
        </CoinText>
      </p>
      <p>
        <CoinText>
          Today that friction is gone. With <strong>Pay from another chain</strong>, any client can open your NimBill invoice link in a
          normal browser and pay with <strong>USDT, USDC, BTC, ETH, SOL, BNB, TRX, POL, AVAX, LTC, or DOGE</strong> from whatever wallet or
          exchange they already use. You still receive the exact locked <strong>USDT on Polygon</strong> straight in your Nimiq Pay wallet,
          verified on-chain, with NimBill never holding the money or any key.
        </CoinText>
      </p>

      <figure className="my-8 border border-ink bg-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/blog/pay-other-chain/screens.png"
          alt="Three phone screens of Pay from another chain: picking a coin and network with a refund address, sending to a one-time deposit address with QR code and countdown, and the invoice marked paid and verified on Polygon."
          className="block w-full"
        />
      </figure>

      <h2 id="one-link-any-wallet">One link, any wallet or exchange</h2>
      <p>
        Until now, sharing a NimBill invoice defaulted to a Nimiq Pay deep link. That worked smoothly when both sides already had Nimiq Pay,
        but it forced everyone else through an app install before they could even see how to pay.
      </p>
      <p>
        Now, the default shared link is the plain NimBill invoice link (<code>/i/&lt;id&gt;</code>), so it opens cleanly in any phone or
        desktop browser. Inside Nimiq Pay, nothing changes: the invoice goes straight to the usual one-tap payment. Outside Nimiq Pay, your
        client sees two clear paths side by side: <strong>Open in Nimiq Pay</strong>, or <strong>Pay from another chain or exchange</strong>
        .
      </p>

      {/* Live grid of all 22 supported routes directly from PAYIN_SOURCES */}
      <div className="my-8 border border-ink bg-paper p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <span className="font-mono text-xs font-semibold tracking-wider uppercase">{PAYIN_SOURCES.length} supported payment routes</span>
          <span className="font-mono text-xs text-muted">All settle as USDT on Polygon</span>
        </div>

        <p className="mt-4 font-mono text-[11px] font-semibold tracking-wider text-muted uppercase">
          Dollar coins · 0.5% buffer · 30 min window
        </p>
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {STABLES.map((s) => (
            <div key={s.id} className="flex items-center gap-2.5 border border-ink bg-paper p-2.5">
              <PayinCoinIcon source={{ asset: s.asset, badge: s.badge }} />
              <div className="min-w-0 leading-tight">
                <span className="block text-sm font-semibold">{s.asset}</span>
                <span className="block truncate text-xs text-muted">{s.chain}</span>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-5 font-mono text-[11px] font-semibold tracking-wider text-muted uppercase">
          Native coins · 2%–3% price buffer · 20–60 min window
        </p>
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {NATIVES.map((s) => (
            <div key={s.id} className="flex items-center gap-2.5 border border-line bg-subtle p-2.5">
              <PayinCoinIcon source={{ asset: s.asset, badge: s.badge }} />
              <div className="min-w-0 leading-tight">
                <span className="block text-sm font-semibold">{s.asset}</span>
                <span className="block truncate text-xs text-muted">{s.chain}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <h2 id="exact-output">Designed backwards: exact USDT in your wallet</h2>
      <p>
        <CoinText>
          Cross-chain swaps usually suffer from the same annoyance as withdrawal tools: the client sends $150 of USDT on Tron, bridge and
          swap fees come off the top, and you receive $148.62 on Polygon. Now the invoice is short by $1.38 and both sides have to chase a
          tiny follow-up transfer.
        </CoinText>
      </p>
      <p>
        We built Pay from another chain backwards: it starts from the exact amount you should receive and works out what your client needs
        to send.
      </p>

      <figure className="my-8 border border-ink bg-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/blog/pay-other-chain/how-swap-works.png"
          alt="Four steps of a cross-chain NimBill payment: locking the exact USDT amount, sending to a one-time deposit address, the swap paying the merchant directly on Polygon, and NimBill checking the Polygon transfer itself."
          className="block w-full"
        />
      </figure>

      <ol>
        <li>
          <strong>Lock the exact USDT price.</strong> NimBill locks a unique USDT quote for the invoice—the same unique amount mechanism our
          direct Polygon USDT payments already use—held for the deposit window plus a 20-minute delivery margin.
        </li>
        <li>
          <strong>Get a one-time address.</strong> NimBill asks our swap partner for a one-time deposit address on the client&apos;s chain
          that delivers <em>at least</em> that exact USDT amount to the merchant&apos;s Polygon address. Swap fees sit on the sender&apos;s
          side, and the amount to send is rounded up cleanly so it is easy to type into an exchange.
        </li>
        <li>
          <strong>Send from any wallet or exchange.</strong> The client scans the QR code or copies the deposit address and exact amount.
          Dollar coins (USDT, USDC) carry a tiny 0.5% buffer and a 30-minute timer. Native coins whose prices move carry a 2% buffer on fast
          chains (ETH, SOL, BNB, TRX, POL, AVAX — 20 minutes) or 3% where blocks take longer (BTC, LTC, DOGE — 60 minutes).
        </li>
        <li>
          <strong>Unused buffer returns automatically.</strong> Whatever the swap does not need to deliver the exact invoice amount goes
          straight back to the client&apos;s refund address.
        </li>
      </ol>

      <h2 id="refund-safety">Guardrails before any money moves</h2>
      <p>
        Before NimBill even creates a deposit address, the client enters a refund address on the chain they are paying from. Sending a
        refund to the wrong network usually means losing it, so NimBill checks that every refund address really belongs to that network and
        has no typos. A Tron address pasted for a Bitcoin payment, or an address with one wrong character, is caught before any money moves.
      </p>

      <Notice title="What if too little arrives, or the price moves past the buffer?">
        <p>
          If an exchange deducts a withdrawal fee from the amount sent, or if a native coin&apos;s price drops past the buffer while the
          deposit is in flight, the swap can&apos;t deliver the exact USDT amount. Instead of delivering a short payment or holding the
          funds, the deposit goes straight back to the client&apos;s refund address. The merchant never received anything, so the invoice
          simply stays unpaid.
        </p>
      </Notice>

      <h2 id="verify-on-polygon">We never take a swap status on faith</h2>
      <p>
        <CoinText>
          Our rule for invoices has never changed: <strong>paid means verified on the blockchain.</strong> Even when the swap reports that
          it is done, NimBill does not mark the invoice paid on its word. It looks up the payout on Polygon itself and checks that:
        </CoinText>
      </p>
      <ul>
        <li>The transaction succeeded on Polygon with confirmations.</li>
        <li>It transferred USDT to the merchant&apos;s Polygon address.</li>
        <li>The amount covers the locked quote and was sent after the quote was created.</li>
        <li>That transaction hash has never paid another invoice.</li>
      </ul>
      <p>
        Only after those checks pass does NimBill mark the invoice paid, exactly as it does for a Nimiq Pay payment. PDF receipts, email
        notifications to you and your client, and online-store notifications all work the same, with nothing extra to set up.
      </p>

      <h2 id="close-the-tab">Built for real life: close the tab, late payouts still land</h2>
      <p>
        Anyone who has withdrawn crypto from an exchange knows it is rarely instant. Sometimes an exchange queues withdrawals for 15 minutes
        or an hour, and almost nobody keeps a checkout tab open that long.
      </p>

      <figure className="my-8 border border-ink bg-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/blog/pay-other-chain/late-and-background.png"
          alt="Diagram showing how Pay from another chain keeps the pay screen up to date, picks a payment back up after a reload, keeps watching for up to three days after the tab is closed, and uses price buffers and refund address checks."
          className="block w-full"
        />
      </figure>

      <p>
        While the pay page is open, it updates every few seconds and remembers the payment in the browser, so reloading picks right back up.
        Once the client sends, they can close the tab immediately. NimBill keeps watching every open payment in the background for up to
        three days, so even a delayed exchange withdrawal still settles the invoice cleanly.
      </p>
      <p>
        And if the invoice was already paid another way, or cancelled, before a late payment arrived, NimBill notes it separately instead of
        counting the invoice paid twice or overwriting its receipt.
      </p>

      <h2 id="full-circle">Any wallet in, any wallet out</h2>
      <p>
        <CoinText>
          Together with <Link href="/blog/money-in-to-money-out">non-custodial withdrawals</Link>, NimBill now connects both ends of a
          freelancer&apos;s or online store&apos;s workflow. Your client can pay with USDT on Tron, USDC on Base, BTC, ETH, or SOL from any
          wallet or exchange; you receive verified USDT straight in Nimiq Pay; and whenever you need to move funds elsewhere, you stay in
          complete control from start to finish.
        </CoinText>
      </p>
      <p>
        Create an invoice in NimBill and share the link to try it out, or say hi and tell us which chain you want next on{" "}
        <a href="https://x.com/mercichidi">X</a>.
      </p>
    </>
  );
}
