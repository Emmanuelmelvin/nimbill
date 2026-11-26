import Link from "next/link";
import { Notice } from "@/components/site/SiteShell";
import { CoinText } from "@/components/ui";
import { ChainLogo, TokenLogo } from "@/components/withdraw/logos";
import { CHAINS } from "@/lib/withdraw/chains";

/** Body of "From money in to money out: how we built withdrawals". */
export default function MoneyInToMoneyOut() {
  return (
    <>
      <p>
        Talent lives everywhere, but good banking does not. Today, a designer in Lagos can finish a brand identity for a company in Berlin
        before lunch. A writer in Nairobi or a developer in Accra can work with clients in London, New York, or Tokyo as easily as if they
        shared the same office. Doing the work across borders is effortless. Getting paid for it, and actually using that money in your
        daily life, is where things still fall apart.
      </p>
      <p>
        If you have ever worked for a client in another country, you already know the frustration. International bank transfers take days to
        arrive. Middleman banks quietly take $30 to $50 off your paycheck along the way. Popular payment apps routinely freeze accounts for
        weeks without explanation, or simply refuse to open accounts in your country at all. Even when the money finally lands, unfair
        exchange rates quietly eat another 5% of what you worked for.
      </p>
      <p>
        <CoinText>
          When we created NimBill for <a href="https://nimiq.com/nimiq-pay">Nimiq Pay</a>, we started with the first half of that problem:{" "}
          <strong>money in</strong>. We made it simple to write an invoice in your own currency (Naira, Shillings, Cedis, Euros, Dollars,
          and 14 more), share a single link or QR code, and get paid in NIM or USDT in seconds. We added public pay boards so anyone can buy
          your products, store notifications for online shops, and digital cheques you can hand to a friend in a chat message.
        </CoinText>
      </p>
      <p>
        <CoinText>
          <strong>But getting paid is only half the story. The other half is spending what you earn.</strong> Having NIM in your wallet
          feels great, yet when rent is due, when you need to pay a supplier, or when you want to move money to the exchange or card you
          already use every day, your earnings need a bridge to the rest of your financial life. To make NimBill truly complete, we had to
          close the circle from <strong>money in</strong> to <strong>money out</strong>, while keeping our most important promise: your
          money always stays in your own hands, and NimBill never holds it.
        </CoinText>
      </p>

      <figure className="my-8 border border-ink bg-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/blog/withdraw/money-in-money-out.png"
          alt="The complete NimBill loop: Money In through invoices, pay boards and cheques; keeping and growing it in Nimiq Pay; and Money Out to the wallet you already use."
          className="block w-full"
        />
      </figure>

      <h2 id="exact-receive">Designed backwards: tell us what should arrive</h2>
      <p>
        <CoinText>
          Most crypto swap tools feel like they were built for currency traders, not for people paying bills. Usually, they ask how much you
          want to send, take out several layers of fees along the way, and leave you with an awkward number like <strong>48.71 USDC</strong>{" "}
          at the end. When you actually needed <strong>50.00 USDC</strong> to pay someone or top up your account, coming up short by a
          dollar and twenty-nine cents is maddening.
        </CoinText>
      </p>
      <p>
        <CoinText>
          So we built <Link href="/withdraw">NimBill Withdraw</Link> the other way around. Instead of guessing how much extra to send, you
          simply tell NimBill the <strong>exact amount you want to receive</strong>. If you ask for <strong>50.00 USDC</strong> on Polygon,
          exactly <strong>50.00 USDC</strong> lands in your Polygon wallet.
        </CoinText>
      </p>

      {/* Live network & token grid */}
      <div className="my-8 border border-ink bg-paper p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <span className="font-mono text-xs font-semibold tracking-wider uppercase">Where your money can land</span>
          <span className="inline-flex items-center gap-2 font-mono text-xs text-muted">
            <TokenLogo asset="USDC" className="h-4 w-4" /> USDC · <TokenLogo asset="USDT" className="h-4 w-4" /> USDT
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {CHAINS.map((c) => (
            <div
              key={c.id}
              className={`flex items-center gap-2.5 border p-2.5 ${
                c.available ? "border-ink bg-paper font-semibold" : "border-line bg-subtle text-muted"
              }`}
            >
              <ChainLogo chain={c.id} muted={!c.available} />
              <span className="flex-1 text-sm">{c.name}</span>
              <span className="font-mono text-[10px] tracking-wider uppercase">{c.available ? "LIVE" : "SOON"}</span>
            </div>
          ))}
        </div>
      </div>

      <p>
        <CoinText>
          Before you approve anything, NimBill fetches a live quote from our swap partner and shows you the full picture on one calm review
          screen: the exact USDC or USDT that will arrive, the small provider and network fees, and about how much NIM it will take. Better
          yet, you do not need any extra coins in your destination wallet to pay for network gas fees. Even if you are withdrawing into a
          brand-new Polygon, Ethereum, or Arbitrum wallet with a zero balance, your stablecoins arrive ready to use.
        </CoinText>
      </p>

      <h2 id="address-guard">A gentle safety net for copy-paste mistakes</h2>
      <p>
        Everyone who uses digital money knows that brief moment of anxiety right after pasting a wallet address. Many exchanges use the same
        token name across completely different networks. It is surprisingly easy to copy a Tron address when you meant to copy a Polygon
        address, and on most apps, sending money to the wrong network means it is gone forever.
      </p>
      <p>
        We wanted NimBill to look out for you before any money can move. When you paste your destination address, NimBill checks that it
        actually belongs to the network you picked. If you chose Polygon and accidentally pasted a Tron, Bitcoin, Solana, or Nimiq address,
        NimBill spots what kind of address it is and tells you in plain English:{" "}
        <em>&quot;That looks like a Tron address. Polygon addresses start with 0x.&quot;</em> If an address has a single mistyped letter or
        number, NimBill catches the typo right away and asks you to copy it again.
      </p>

      <figure className="my-8 border border-ink bg-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/blog/withdraw/withdraw-screens.png"
          alt="Three phone screens of NimBill Withdraw: picking Polygon, Ethereum or Arbitrum; reviewing a live quote for 50.00 USDC; and the bank and mobile money waitlist."
          className="block w-full"
        />
      </figure>

      <h2 id="how-it-moves">How your money moves safely without a middleman</h2>
      <p>
        <CoinText>
          Usually, when you withdraw money through an app, you have to send your funds to a company&apos;s account and hope they send the
          other currency back to you. We refused to build NimBill that way. We never want to hold your money, and we never want you to have
          to trust us with your balance.
        </CoinText>
      </p>
      <p>
        Instead, when you tap <strong>Approve in Nimiq Pay</strong>, your withdrawal uses a clever safety mechanism called a{" "}
        <strong>hold payment</strong>:
      </p>

      <figure className="my-8 border border-ink bg-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/blog/withdraw/atomic-bridge.png"
          alt="Four steps of a NimBill withdrawal: asking for an exact amount, approving a hold payment in Nimiq Pay, receiving stablecoins from the swap partner, and blockchain confirmation."
          className="block w-full"
        />
      </figure>

      <ol>
        <li>
          <strong>You lock in your quote.</strong> You choose your network, paste your address, and review the exact USDC or USDT amount
          that will arrive.
        </li>
        <li>
          <strong>Your payment is held, not taken.</strong> When you approve in Nimiq Pay, your payment is placed on hold rather than handed
          over right away. Think of it like a locked box with two sides: the swap provider can see that your payment is waiting, but they
          cannot collect it until your USDC or USDT has been delivered to your destination address.
        </li>
        <li>
          <strong>Your stablecoins are sent to your wallet.</strong> Seeing that your payment is safely held, the swap provider sends the
          exact USDC or USDT straight to your Polygon, Ethereum, or Arbitrum wallet.
        </li>
        <li>
          <strong>Verified on the blockchain.</strong> NimBill checks the destination blockchain itself to make sure the stablecoins really
          landed in your wallet before marking the withdrawal <strong>Delivered</strong>.
        </li>
      </ol>

      <Notice title="What if something goes wrong halfway through?">
        <p>
          If the swap provider cannot complete the delivery for any reason, they never get the key to collect your held payment. The hold
          simply cancels, and Nimiq Pay returns your NIM back to your wallet automatically. Nothing is held by NimBill, and nothing is lost.
        </p>
      </Notice>

      <h2 id="real-life">Built for real life: approve once, then put your phone in your pocket</h2>
      <p>
        A lot of financial tools are tested in offices with fast Wi-Fi, where someone sits and watches a loading bar for two minutes. Real
        life does not look like that. In real life, you approve a withdrawal while riding in a bus, your phone screen locks, you switch over
        to reply to a WhatsApp message, or your mobile signal drops for a moment.
      </p>
      <p>
        In many web apps, closing the tab before a swap finishes leaves your money stuck in limbo until you open the app again. We built
        NimBill so that <strong>your single tap in Nimiq Pay is the only step that needs you</strong>.
      </p>

      <figure className="my-8 border border-ink bg-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/blog/withdraw/worker-and-finality.png"
          alt="Diagram showing how NimBill finishes your withdrawal whether you keep the progress screen open or close your phone immediately after approving."
          className="block w-full"
        />
      </figure>

      <p>
        If you leave the screen open, you can watch each step tick by from <em>Paying</em> to <em>Swapping</em> to <em>Delivering</em> to{" "}
        <em>Delivered</em>, complete with a link to your blockchain receipt. And if you close NimBill the very second after you approve in
        Nimiq Pay, our background assistant quietly watches the swap for you, completes the final delivery step the moment your stablecoins
        are ready, and records your receipt for the next time you open the app.
      </p>

      <h2 id="future">Where we are going next: the future of global payments</h2>
      <p>
        <CoinText>
          Launching USDC and USDT withdrawals on Polygon, Ethereum, and Arbitrum completes the first full circle of NimBill: from a
          client&apos;s local currency, into NIM or USDT in your wallet, and out to the dollar stablecoins accepted by almost every global
          exchange, crypto card, and savings app in the world.
        </CoinText>
      </p>
      <p>But this is just the foundation. Here is what we are working toward next:</p>
      <ol>
        <li>
          <strong>Six more popular networks.</strong> Base, Optimism, Solana, Tron, BNB Chain, and Avalanche are already built into the
          Withdraw screen and marked as coming soon. For millions of freelancers across Africa, Latin America, and Asia, USDT on Tron and
          USDC on Base or Solana are how everyday business gets done. We are bringing those routes into the same one-tap flow.
        </li>
        <li>
          <strong>Direct cash-outs to local banks and mobile money.</strong> Stablecoins open the door to global finance, but the ultimate
          dream is the final mile: turning the NIM or USDT you earned straight into Naira in your Nigerian bank account, Kenyan Shillings on
          M-Pesa, Ghanaian Cedis on mobile money, or Rand in South Africa. On the{" "}
          <Link href="/withdraw">Withdraw → Bank and mobile money</Link> tab, freelancers and businesses are already joining our waitlist
          and telling us which country and payout method they need first. While we use that real community demand to bring licensed local
          partners onboard, the screen also points you to fellow Nimiq Pay Mini Apps like <strong>AbaPay</strong> and{" "}
          <strong>NimPoint</strong> that already help turn NIM into Naira today.
        </li>
        <li>
          <strong>Effortless money management for people and AI assistants.</strong> When money in and money out live under one roof, your
          wallet can work for you automatically. Imagine getting paid for an invoice, having a portion staked to earn rewards in one tap,
          and moving what you need for the week into USDC or your local currency whenever you choose.
        </li>
      </ol>
      <p>
        <CoinText>
          We are building NimBill because we believe where you live should never limit who you can work with or how fast you can get paid.
          Whether you are a freelancer sending your first international invoice, a shop owner taking payments online, or someone sending a
          birthday cheque to a friend, your money should move across the world as easily as sending a text message, and it should belong to
          you from the first second to the last.
        </CoinText>
      </p>
      <p>
        Open <Link href="/withdraw">NimBill → Withdraw</Link> to explore the new screen, join the local bank and mobile money waitlist for
        your country, and come tell me what we should build next on <a href="https://x.com/mercichidi">X</a>!
      </p>
    </>
  );
}
