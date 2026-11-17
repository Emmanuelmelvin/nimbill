import Link from "next/link";
import { ChequeCard } from "@/components/ChequeCard";
import { Notice } from "@/components/site/SiteShell";
import { CoinText } from "@/components/ui";
import type { PublicCheque } from "@/lib/cheques";

const FREE_SAMPLE: PublicCheque = {
  id: "k7m2p9qx4z",
  number: "CHQ-K7M2P-9QX4Z",
  writer: {
    name: "Ada Studio",
    tag: "adaokafor",
    handle: "adaokafor@nimbill",
    avatarUrl: null,
  },
  chequeAddress: "NQ48 7K2M P9QX 4ZA2 B3C4 D5E6 F7G8 H9J2 9Q4Z",
  chequePublicKey: "0".repeat(64),
  recipient: {
    kind: "free",
    tag: null,
    handle: null,
    name: "First to claim",
    address: null,
    avatarUrl: null,
  },
  amount: "7763373000",
  currency: "NGN",
  fiatAmount: "25000.00",
  rate: "0.322",
  note: "Happy birthday, Tunde!",
  status: "funded",
  fundTxHash: null,
  settleTxHash: null,
  claimedBy: null,
  isWriter: false,
  direction: null,
  createdAt: "2026-11-16T10:00:00.000Z",
  fundedAt: "2026-11-16T10:00:05.000Z",
  settledAt: null,
};

const TAG_SAMPLE: PublicCheque = {
  id: "8x3n24v9wt",
  number: "CHQ-8X3N2-4V9WT",
  writer: {
    name: "Ada Studio",
    tag: "adaokafor",
    handle: "adaokafor@nimbill",
    avatarUrl: null,
  },
  chequeAddress: "NQ82 4V9W T8X3 N2A7 C6E5 G4J3 K2M9 P8Q7 3X9N",
  chequePublicKey: "0".repeat(64),
  recipient: {
    kind: "tag",
    tag: "tunde",
    handle: "tunde@nimbill",
    name: "Tunde Bello",
    address: "NQ70 FH7V 3KUP 6JLJ 0TX4 NNRH 87F2 QMDJ GSNT",
    avatarUrl: null,
  },
  amount: "125000000",
  currency: "NIM",
  fiatAmount: "1250.00000",
  rate: "1",
  note: "Logo concept bonus",
  status: "cashed",
  fundTxHash: null,
  settleTxHash: null,
  claimedBy: {
    name: "Tunde Bello",
    handle: "tunde@nimbill",
  },
  isWriter: false,
  direction: null,
  createdAt: "2026-11-16T11:00:00.000Z",
  fundedAt: "2026-11-16T11:00:04.000Z",
  settledAt: "2026-11-16T11:02:10.000Z",
};

/** Body of "How we built non-custodial cheques on Nimiq". */
export default function HowWeBuiltCheques() {
  return (
    <>
      <p>
        <CoinText>
          Every digital payment usually starts with the same mood-killing question: <em>&quot;Hey, send me your wallet address.&quot;</em>{" "}
          If you are paying a formal business invoice, asking for payment details makes sense. But if you want to send Tunde ₦25,000 for his
          birthday, tip someone in a community group chat, or hand a quick refund to a customer, asking for a long string of letters and
          numbers feels like asking a friend for their bank routing number at a birthday party.
        </CoinText>
      </p>
      <p>
        <CoinText>
          Paper cheques solved this centuries ago. You write the amount on a slip of paper, sign your name, and hand it over. Of course,
          paper cheques had one notorious flaw: they could bounce if the writer&apos;s account was empty. When we set out to build{" "}
          <Link href="/cheques">NimBill Cheques</Link>, we wanted the warmth and simplicity of handing someone an envelope of cash, combined
          with the certainty of the Nimiq blockchain.
        </CoinText>
      </p>
      <p>
        Here is how we built a digital cheque that never bounces, works in your local currency, and stays completely out of our hands so
        only you and your recipient can ever touch the money.
      </p>

      <h2 id="two-flavours">Two ways to write a cheque: open to anyone, or locked to one person</h2>
      <p>
        <CoinText>
          When you open the Cheques tab in NimBill, you can write a cheque in NIM or in any of our 19 local currencies (including Naira,
          Shillings, Cedis, Euros, and Dollars). If you type an amount in your local currency, NimBill converts it at the live exchange rate
          and locks that NIM inside the cheque right away. Then you pick who can cash it:
        </CoinText>
      </p>
      <ul>
        <li>
          <strong>A free cheque (first to claim).</strong> Think of this like cash inside a greeting card. You can send the link over
          WhatsApp, print the QR code on a poster, or drop it into a group chat as a giveaway. The first person to open it and tap{" "}
          <strong>Cash</strong> gets the full amount.
        </li>
        <li>
          <strong>A tag-locked cheque (made out to a @tag).</strong> If you write a cheque to a specific NimBill user like{" "}
          <strong>tunde@nimbill</strong>, it works like writing their name on the &quot;Pay to the order of&quot; line. Even if someone else
          sees the link or scans the QR code, the cheque will refuse to pay anyone except Tunde.
        </li>
        <li>
          <strong>Changed your mind? Take it back anytime.</strong> Everyone has sent a message to the wrong chat at least once. As long as
          a cheque has not been cashed yet, the person who wrote it can tap <strong>Cancel &amp; take back</strong> to return the full
          amount straight back to their own wallet.
        </li>
      </ul>

      <div className="my-8 grid gap-5 sm:grid-cols-2">
        <ChequeCard cheque={FREE_SAMPLE} />
        <ChequeCard cheque={TAG_SAMPLE} />
      </div>

      <h2 id="puzzle">The big challenge: how do you enforce rules without becoming a bank?</h2>
      <p>
        Making a link that sends money sounds simple on the surface, until you ask a hard question:{" "}
        <strong>where does the money sit while the cheque is waiting to be cashed?</strong>
      </p>
      <p>Most payment apps take one of two shortcuts, and both of them have a serious catch:</p>
      <ol>
        <li>
          <strong>Shortcut 1: Let the app hold the money.</strong> The app takes your money into its own company account and waits for your
          friend to show up. That makes it easy to check who is cashing the cheque, but it turns the app into a middleman. If the
          company&apos;s servers ever go down or get hacked, every uncashed cheque is at risk. At NimBill, our number one rule is that we
          never hold your money.
        </li>
        <li>
          <strong>Shortcut 2: Put the entire key to the wallet inside the link.</strong> You could create a temporary wallet for the cheque
          and put its full password inside the web link. Now the app never holds the money! The problem is that anyone who sees the link has
          total control over that wallet. You could never lock a cheque to <strong>tunde@nimbill</strong>, because a stranger who found the
          link could bypass the app entirely and empty the wallet themselves.
        </li>
      </ol>
      <p>
        We wanted both protections at once. We needed a cheque where <strong>NimBill can never touch the money on its own</strong>, and at
        the same time, <strong>nobody can break the rules written on the face of the cheque</strong>.
      </p>

      <figure className="my-8 border border-ink bg-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/blog/cheques/cheque-anatomy.png"
          alt="How a NimBill cheque link works: the public cheque number shows the card, while the secret key after the # symbol stays on your phone. Both keys are needed to open the safe."
          className="block w-full"
        />
      </figure>

      <h2 id="two-key-safe">Our solution: a digital safe with two keys</h2>
      <p>
        Think of how a traditional bank vault or safety deposit box works. There is one lock for the bank manager and a second lock for the
        customer. Neither person can open the box alone. It only opens when both keys turn together.
      </p>
      <p>Every single NimBill cheque gets its own brand-new, temporary wallet on the Nimiq blockchain, built like a two-key safe:</p>
      <ul>
        <li>
          <strong>Key 1 lives inside the link you share.</strong> The moment you write a cheque, your phone creates a secret key and tucks
          it at the very end of the cheque link, right after the <strong>#</strong> symbol. Because of how web browsers work, the part of a
          link after a <strong>#</strong> symbol stays strictly on your phone or computer and is never sent over the internet to the website
          you are visiting. That means NimBill&apos;s servers literally never see Key 1.
        </li>
        <li>
          <strong>Key 2 lives with NimBill as a rule guard.</strong> NimBill holds the second half of the lock. Its only job is to check the
          rules on the cheque before turning its key.
        </li>
      </ul>

      <Notice title="Why this keeps your money safe from everyone">
        <p>
          <strong>NimBill cannot touch your cheque</strong> because we only have Key 2. Without the link you hold on your phone, the safe
          stays locked.
        </p>
        <p>
          <strong>A stranger cannot hijack a tag-locked cheque</strong> because even if they find the link (Key 1), NimBill will refuse to
          turn Key 2 unless the money is going straight into the recipient&apos;s wallet.
        </p>
      </Notice>

      <h2 id="cashing">What happens when you tap &quot;Cash&quot;</h2>
      <p>
        Even though a two-key safe sounds sophisticated, cashing a cheque takes a single tap and about two seconds. Your friend does not
        even need a NimBill account to claim a free cheque.
      </p>

      <figure className="my-8 border border-ink bg-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/blog/cheques/schnorr-handshake.png"
          alt="Four steps when cashing a cheque: open the link, NimBill checks the rules, both keys turn together, and 100% of the NIM lands in the recipient's wallet with zero fee."
          className="block w-full"
        />
      </figure>

      <ol>
        <li>
          <strong>Open the cheque.</strong> Your friend opens the link you sent, scans your QR code in person, or pastes the cheque code
          into NimBill. They see the cheque card with your name, the amount, and your note.
        </li>
        <li>
          <strong>NimBill checks the rules.</strong> When they tap <strong>Cash</strong>, NimBill checks that the cheque is funded and has
          not been cancelled. If the cheque was written to a specific <strong>@tag</strong>, NimBill makes sure the destination wallet
          belongs to that person.
        </li>
        <li>
          <strong>Both keys turn together.</strong> NimBill provides its half of the approval, and your friend&apos;s browser adds the
          link&apos;s half right on their device. Together, the two halves form a single, normal Nimiq transfer.
        </li>
        <li>
          <strong>100% of the money arrives.</strong> The transfer is sent to the Nimiq blockchain with zero network fee, so every single
          NIM locked inside the cheque lands in your friend&apos;s wallet.
        </li>
      </ol>

      <h2 id="details">The little details we cared about</h2>
      <p>
        When people use real money, small details matter just as much as the big idea. While building cheques, we spent a lot of time making
        sure nothing could go wrong in everyday situations:
      </p>
      <ul>
        <li>
          <strong>Locking the recipient&apos;s wallet the day you write the cheque.</strong> What if you write a cheque to{" "}
          <strong>ada@nimbill</strong>, and before Ada gets around to cashing it, she changes her tag and someone else registers{" "}
          <strong>ada@nimbill</strong> later on? We made sure the cheque remembers Ada&apos;s actual wallet from the moment you wrote it, so
          a tag changing hands can never redirect your money to a stranger.
        </li>
        <li>
          <strong>Never leaving spare change behind.</strong> If someone funds a cheque and accidentally sends a tiny bit more than the
          written amount, cashing or cancelling the cheque always sweeps the entire balance of the cheque wallet so no money is ever left
          stranded.
        </li>
        <li>
          <strong>Recovering automatically if your connection drops.</strong> If someone taps Cash right as their phone loses signal in an
          elevator, the cheque never gets stuck. Every time a cheque page is opened, NimBill checks the Nimiq blockchain directly to see if
          the transfer went through, and updates the cheque automatically.
        </li>
        <li>
          <strong>Easy-to-read cheque codes and key backups.</strong> Sometimes you want to read a cheque over the phone or paste it on
          another device without sending a web link. Every cheque comes with a printable code (grouped neatly with dashes, leaving out
          confusing lookalike letters like <strong>0</strong> and <strong>O</strong> or <strong>1</strong> and <strong>I</strong>). Your
          browser also keeps a backup of the cheques you have written so you can copy them somewhere safe with one tap.
        </li>
        <li>
          <strong>Ready for AI assistants too.</strong> If you connect an AI assistant like Claude or Cursor to NimBill&apos;s agent wallet,
          your assistant can write and cash cheques using the exact same two-key safety model, so you can ask your AI to create a reward
          cheque or claim one on your behalf.
        </li>
      </ul>

      <figure className="my-8 border border-ink bg-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/blog/cheques/cheque-lifecycle.png"
          alt="Every stage of a NimBill cheque: from Write & Fund, to Ready to Share, to On Its Way, to Cashed or Cancelled."
          className="block w-full"
        />
      </figure>

      <h2 id="try-it">Try writing your first cheque</h2>
      <p>
        <CoinText>
          Whether you are sending a birthday gift across the world, splitting dinner with a friend, or dropping a surprise tip in a group
          chat, <Link href="/cheques">NimBill Cheques</Link> let you hand over digital money as naturally as cash, without ever asking for a
          wallet address first. Open NimBill in <a href="https://nimiq.com/nimiq-pay">Nimiq Pay</a>, write a cheque for a few cents, and see
          how it feels. I would love to hear what you think on <a href="https://x.com/mercichidi">X</a>!
        </CoinText>
      </p>
    </>
  );
}
