import type { Metadata } from "next";
import Link from "next/link";
import { Notice, PageHero, Prose } from "@/components/site/SiteShell";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Privacy",
  ogTitle: "NimBill privacy policy",
  description:
    "What NimBill stores, who can see it, and which outside services it talks to. Non-custodial: NimBill never holds your money or your keys.",
  path: "/privacy",
});

// Written from what the code stores (src/lib/db/schema.ts) and the services it calls (src/lib/clients,
// sentry-options.ts). Keep it in step when either changes.
const UPDATED = "14 November 2026";

export default function PrivacyPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Privacy policy" lead="What NimBill stores, who can see it, and which outside services it talks to.">
        <p className="mt-4 font-mono text-[11px] tracking-wider text-muted uppercase">Last updated {UPDATED}</p>
        <Notice title="Draft">
          <p>
            This policy is a draft written from what the app actually stores and sends. It has not been reviewed by a lawyer, and the owner
            still has to confirm it, add a contact address and name the legal entity (if any) responsible for NimBill.
          </p>
        </Notice>
      </PageHero>

      <Prose>
        <h2 id="summary">The short version</h2>
        <ul>
          <li>NimBill is non-custodial. It never holds your money and never sees your wallet&apos;s private keys.</li>
          <li>You sign in by signing a message with your Nimiq wallet. There are no passwords.</li>
          <li>
            NimBill stores what you type into it (names, invoices, products, an optional email) so the app can work. It does not sell it or
            use it for advertising.
          </li>
          <li>Payments happen on public blockchains. Transactions there are public and permanent, and NimBill can&apos;t change that.</li>
          <li>There are no advertising or analytics trackers.</li>
        </ul>

        <h2 id="stored">What NimBill stores</h2>
        <h3>If you use NimBill as a merchant</h3>
        <ul>
          <li>
            <strong>Your wallet address.</strong> Your Nimiq address identifies your account. If you turn on USDT, your Polygon address is
            stored too.
          </li>
          <li>
            <strong>Your profile.</strong> Your name, your tag (like <code>ada@nimbill</code>), an optional bio and an optional photo.
          </li>
          <li>
            <strong>Your email, if you add one.</strong> It is used only to email you when an invoice is paid, and is never shown publicly.
          </li>
          <li>
            <strong>Invoices.</strong> Client name, optional client email, line items, amounts, currency, note, due date, and, once paid,
            the payment details (coin, amount, rate, transaction hash, the paying wallet and the time). NimBill also records when someone
            other than you first opened an unpaid invoice, so you can see it was viewed.
          </li>
          <li>
            <strong>Saved clients.</strong> Names and optional emails of people you bill often.
          </li>
          <li>
            <strong>Products.</strong> Names, descriptions, prices and pictures for your pay board.
          </li>
          <li>
            <strong>Goals, cheques and transfers.</strong> Earnings goals you set; cheques you write or cash (amounts, notes, names and tags
            involved); and money you send to or receive from other NimBill users by tag, with an optional private note.
          </li>
          <li>
            <strong>Webhooks.</strong> If you use <Link href="/docs/webhooks">Pay with NimBill</Link>: your webhook URL, the one origin
            payers may return to, your webhook secret (stored encrypted), the order reference and metadata your store attaches to an
            invoice, and a delivery log (status codes and errors) for each webhook.
          </li>
        </ul>

        <h3>If you pay an invoice or use a pay board</h3>
        <p>
          You don&apos;t need an account. When you create an invoice on someone&apos;s board, NimBill stores what you enter (your name, and
          what you are paying for) as part of that invoice. A store that sends you to NimBill may attach its own order reference. When you
          pay, NimBill stores a price quote and, once it finds your payment on the blockchain, the transaction hash and the wallet it came
          from.
        </p>

        <h3>In your browser</h3>
        <ul>
          <li>
            One sign-in cookie (<code>httpOnly</code>, signed, for merchants who are signed in). NimBill uses no other cookies.
          </li>
          <li>
            Some preferences in local storage, such as the currency you last invoiced in, and the secret links of cheques you wrote, so you
            can share them again. These stay on your device.
          </li>
        </ul>

        <h2 id="public">What is public</h2>
        <ul>
          <li>Your pay board: your name, tag, bio, photo, products and their pictures, and your wallet addresses.</li>
          <li>
            An invoice link: anyone with the link can see the invoice, including the client name, line items, note and your name. Client
            emails are never shown.
          </li>
          <li>
            The <Link href="/stats">stats page</Link> lists recent paid invoices by number, amount and transaction, without names.
          </li>
          <li>
            Blockchain transactions. Every payment, its amount and the wallets involved are public on the Nimiq or Polygon blockchain. Nimiq
            payments carry a short memo that links them to a NimBill invoice.
          </li>
        </ul>

        <h2 id="services">Outside services</h2>
        <p>To work, NimBill calls a few outside services. Each gets only what it needs.</p>
        <ul>
          <li>
            <strong>Hosting and database.</strong> The app runs on Vercel and stores its data in a Postgres database. Like most web servers,
            they log requests, including IP addresses, for operating and protecting the service.
          </li>
          <li>
            <strong>Resend</strong> sends the &quot;invoice paid&quot; emails. It receives your email address and the email&apos;s content
            (invoice number, amount and client name).
          </li>
          <li>
            <strong>Sentry</strong> receives error reports when something breaks, if error reporting is turned on. Reports are stripped of
            cookies, request bodies, query strings and user details, and email addresses are removed from messages before sending.
          </li>
          <li>
            <strong>CoinGecko</strong> provides NIM and USDT prices. NimBill asks for prices only; no personal data is sent.
          </li>
          <li>
            <strong>Blockchain nodes.</strong> NimBill reads transactions from public Nimiq and Polygon RPC nodes to verify payments, and
            asks a public validators list for staking information. It sends transaction hashes and wallet addresses, which are public
            anyway.
          </li>
          <li>
            <strong>Your store</strong>, if you set up webhooks: NimBill sends paid-invoice details to the URL you entered.
          </li>
        </ul>

        <h2 id="use">How the data is used</h2>
        <p>
          Only to run NimBill: to show your invoices and board, verify payments, send the emails you asked for, deliver your webhooks,
          prevent abuse (for example with rate limits based on IP address, kept in memory) and fix errors. NimBill does not sell personal
          data, show ads or build profiles.
        </p>

        <h2 id="retention">How long it is kept</h2>
        <p>
          Account data is kept while you use NimBill. You can edit or clear your name, email, bio, photo, products and saved clients in the
          app. Paid invoices are kept as a record of the payment. Blockchain transactions can&apos;t be deleted by anyone.
        </p>
        <p>The app has no self-serve account deletion yet. To have your data removed, contact the owner (see below).</p>

        <h2 id="contact">Contact</h2>
        <p>
          Questions about this policy or your data: send a message to <a href="https://x.com/mercichidi">@mercichidi on X</a>. A contact
          email will be added here.
        </p>
        <p>
          See also the <Link href="/terms">terms of use</Link>.
        </p>
      </Prose>
    </>
  );
}
