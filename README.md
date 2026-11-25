<p align="center">
  <img src="docs/readme/banner.png" alt="NimBill: invoice in your currency, get paid in NIM or USDT. Three phone screens: the earnings dashboard, a client's locked price quote, and a payment confirmed on the Nimiq blockchain." width="100%">
</p>

<p align="center">
  <a href="https://nimbill.mblob.me"><b>Live app</b></a> ·
  <a href="demo/nimbill-demo.mp4"><b>96-second demo video</b></a> ·
  <a href="https://nimbill.mblob.me/docs"><b>Developer docs</b></a> ·
  <a href="https://nimbill.mblob.me/docs/webhooks"><b>Pay with NimBill</b></a> ·
  <a href="https://nimbill.mblob.me/ai"><b>AI setups</b></a> ·
  <a href="https://nimbill.mblob.me/mcp"><b>MCP agent wallet</b></a> ·
  <a href="https://nimbill.mblob.me/stats"><b>Live usage, with on-chain proof</b></a>
</p>

<p align="center">
  <img alt="Nimiq Pay Mini App" src="https://img.shields.io/badge/Nimiq_Pay-Mini_App-000000?style=flat-square">
  <img alt="Competition: Cycle III, Pay category" src="https://img.shields.io/badge/Mini_Apps_Competition-Cycle_III_·_Pay-F5B800?style=flat-square">
  <a href="https://www.npmjs.com/package/nimbill-mcp"><img alt="npm: nimbill-mcp" src="https://img.shields.io/npm/v/nimbill-mcp?style=flat-square&label=nimbill-mcp&color=000000"></a>
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-000000?style=flat-square">
</p>

# NimBill: invoices paid in NIM & USDT

A [Nimiq Pay](https://nimiq.com/nimiq-pay) Mini App for freelancers and small businesses. **Invoice clients in your local currency, get paid in NIM or USDT straight to your wallet, with every payment verified on-chain.**

Built for the [Nimiq Mini Apps Competition — Cycle III](https://miniappscompetition.com/cycle3), **Pay** category.

> **Try it in 30 seconds:** open the [live app](https://nimbill.mblob.me) in Nimiq Pay and tap **"Pay a sample invoice"**. It runs the whole flow, from quote to on-chain receipt, for about $0.05.

|                                   |                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **No account for clients**        | They open one link in any browser and pay in Nimiq Pay or from any other wallet or exchange.                |
| **Pay from any chain**            | Clients pay with USDT, USDC, BTC, ETH, SOL and 6 more across 10+ chains; you receive exact USDT on Polygon. |
| **Wallet to wallet**              | NimBill never holds funds.                                                                                  |
| **Verified on-chain**             | The server reads every payment from the blockchain before an invoice is marked paid.                        |
| **19 currencies**                 | Naira, Shillings, Cedis, Euros, Rupees and more, at a live rate locked for 5 minutes.                       |
| **Made for people and AI agents** | A public JSON API, an OpenAPI spec, and an MCP server that gives an agent its own wallet.                   |
| **Pay with NimBill for stores**   | Your store creates invoices, customers pay wallet to wallet, and a signed webhook says when.                |
| **Get your money out**            | Turn NIM into USDC or USDT on Polygon, Ethereum or Arbitrum through an atomic swap.                         |

## How it works

![Four steps: create an invoice in Naira, share a link or QR code, the client pays at a locked NIM price, and the payment is confirmed on the Nimiq blockchain.](docs/readme/flow.png)

1. **Create.** Price the job in your currency. The live NIM total shows as you type.
2. **Share.** Send one link over WhatsApp, use the share sheet, show a QR code in person, or read out a short `NMN-` number.
3. **Pay.** In Nimiq Pay, the client taps **Get price** to lock the rate for 5 minutes and pay in NIM or USDT. Clients without Nimiq Pay pick **Pay from another chain or exchange** and send USDT, USDC, BTC, ETH, SOL, or 6 more coins from any wallet or exchange.
4. **Verified.** The server checks the transaction on the Nimiq or Polygon blockchain, then both sides get a receipt with the rate used and a link to the transaction.

## Features

![Freelancer screens: an earnings dashboard with a monthly goal, the invoice list with overdue badges and WhatsApp reminders, and staking earnings with a top-rated pool.](docs/readme/features-business.png)

- **Earnings at a glance.** One chart in Naira, NIM or USDT, split by coin, with top clients and a monthly income goal that shows the daily pace you need.
- **Invoices and reminders.** Line items, due date and note. See when a client opens an invoice, spot overdue ones, and send a one-tap payment reminder. Export to CSV for your accountant.
- **Stake what you earn.** After a NIM payment, stake it with a top-rated pool in one tap. The dashboard shows what is staked and where, and lets you stake more, unstake, and move unstaked NIM back once the waiting period ends.
- **Know when you are paid.** Add an email in Settings (optional) and NimBill emails you once when an invoice is paid. This needs `RESEND_API_KEY` on the server.

![More ways to get paid: a public pay page for adaokafor@nimbill, writing a ₦25,000 cheque, and a receipt showing the settlement amount, rate and transaction.](docs/readme/features-pay.png)

- **A tag instead of an address.** Every user claims a tag like `ada@nimbill`. Lookalike-safe rules and reserved names, and a given-up tag stays held for its owner for 90 days.
- **A public pay page.** `/pay/<tag>` lets anyone pay you without an account: an amount for something, or one of your products (with a quantity). Visitors' invoices get your next `INV-` number only once paid, so unpaid ones never leave gaps. They appear under Board → Orders.
- **Products.** Name, price, description and a picture. Pictures are shrunk in the browser and stored in the database, so there is no file storage to set up.
- **Send money by tag.** Type a tag, check the name and address it belongs to, and send NIM, or USDT on Polygon to anyone who added a Polygon wallet (amount in the coin or any supported currency). Transfers are verified on-chain like invoices. USDT has no memo, so each USDT transfer gets a unique exact amount and is matched by both wallets, that amount and when it was sent; no open invoice to the same wallet uses that amount, and one transaction never counts as both a transfer and an invoice payment.
- **Cheques** (`/cheques`, `/c/<id>`). Write a cheque in NIM or any supported currency, either locked to one `@tag` or open to the first person with the link, QR code or `CHQ-…` code. [How cheques stay non-custodial ↓](#non-custodial-cheques) · [Read the blog post](https://nimbill.mblob.me/blog/how-we-built-cheques)
- **Coins and currencies you can recognise.** The real NIM and USDT logos appear wherever a coin is mentioned, and every currency picker shows the country's flag.
- **Receipts that hold up.** The rate used, both addresses and a link to the transaction. Download as PDF.
- **Public usage page** (`/stats`). Every paid invoice links to its on-chain transaction.

## Pay from another chain: any wallet, any exchange

![Pay from another chain screens: picking from 22 coin and network routes with a refund address, sending to a one-time deposit address with QR code and countdown, and the invoice marked paid and verified on Polygon.](docs/readme/pay-other-chain.png)

Most clients don't have Nimiq Pay yet, but many already hold USDT on Tron, USDC on Base or Solana, or BTC, ETH, and SOL in a wallet or exchange. **Pay from another chain** lets them pay any NimBill invoice from whatever wallet they already use—while you still receive the exact locked **USDT on Polygon** straight in your Nimiq Pay wallet.

- **22 routes across 11 coins and 10+ chains.** Dollar coins (USDT on Tron, BNB Chain, Solana, Ethereum, Arbitrum; USDC on BNB Chain, Solana, Ethereum, Arbitrum, Base, Polygon) and native coins (BTC, ETH on Ethereum/Arbitrum/Base, SOL, BNB, TRX, POL, AVAX, LTC, DOGE).
- **Exact USDT arrives, never held by NimBill.** Powered by [NEAR Intents' 1Click API](https://docs.near-intents.org/integration/distribution-channels/1click-api) using `EXACT_OUTPUT` quotes: fees and price-movement buffers (0.5% for stablecoins, 2% for fast native coins, 3% for BTC/LTC/DOGE) sit on the sender side, and any unused buffer goes back to the client's refund address.
- **Per-chain refund address guard.** Before a deposit address is created, NimBill validates the client's refund address for that exact chain (EIP-55, Tron Base58Check, Solana, Bitcoin/Litecoin Bech32/Bech32m, Dogecoin). Short or unfillable deposits are refunded automatically by 1Click.
- **Verified on Polygon, even if the tab closes.** NimBill never trusts a swap status on its own: `settleSwapPayment` verifies the actual Polygon USDT transfer before calling `markPaid`, firing receipts and store webhooks as usual. The browser polls every 5 s (and resumes on reload), while the background worker keeps watching through 1Click's 72-hour late-deposit window.

Controlled with `PAYIN_LIVE` (default `true`) and optional `ONECLICK_API_KEY`. Full notes, limits and statuses: [docs/pay-from-other-chains.md](docs/pay-from-other-chains.md).

> **Want to know how cross-chain payments work under the hood?** Read the blog post: [**Pay from any chain: let clients pay from the wallet they already use →**](https://nimbill.mblob.me/blog/pay-from-any-chain).

## Withdraw: get your money out

![Withdraw screens: picking a chain (Polygon, Ethereum and Arbitrum live, six more marked soon), a live quote for exactly 50 USDC on Polygon, and the bank and mobile money waitlist.](docs/readme/withdraw.png)

Getting paid is half the job; the other half is spending it. Withdraw turns the NIM you earned into the stablecoin your exchange or wallet already uses.

- **Pick where it lands.** USDC or USDT on Polygon, Ethereum or Arbitrum, each with its network and coin logo. Base, Optimism, Solana, Tron, BNB Chain and Avalanche are listed as coming soon. The address is checked against the chain you picked, so a Tron address can't be pasted for Polygon.
- **Receive an exact amount.** A live quote from [Lendaswap](https://lendaswap.com) shows what arrives, the fees, and about how much NIM it takes. Nimiq Pay shows the exact amount when you approve.
- **One approval.** Nimiq Pay pays a Lightning invoice with your NIM. After that NimBill finishes the swap on its own, even if you close the app, and marks it delivered only once the transfer is final on the chain.
- **Nothing held, nothing lost.** The Lightning invoice is a _hold_ invoice: the swap provider can only collect it after your stablecoin has been claimed to your address. If the swap can't finish, the payment is cancelled and the money goes back.
- **Bank and mobile money, next.** Cash-outs to a Nigerian bank or mobile money wallet are coming. Join the waitlist on the Withdraw screen, or use a partner Mini App today.

Real withdrawals are switched on with `WITHDRAW_LIVE=true` once they have passed a real-money test; until then the screen shows sample quotes and nothing can be paid. Setup, the safety model and the test steps: [docs/withdrawals.md](docs/withdrawals.md).

> **Want to know how we built the withdrawal system?** Read our blog post on completing the loop from money in to money out: [**From money in to money out: how we built non-custodial withdrawals →**](https://nimbill.mblob.me/blog/money-in-to-money-out).

## How payment verification works

![Diagram: the client wallet sends a transaction to the Nimiq blockchain; the NimBill server reads it over RPC and runs six checks before marking the invoice paid.](docs/readme/verify.png)

1. The client taps **Get price**. The server creates a quote: the fiat total ÷ the live CoinGecko rate, rounded **up**. The quote expires after 5 minutes.
2. The wallet sends the exact amount. NIM payments carry `NimBill <invoiceId>` as transaction data.
3. The client polls `/api/invoices/:id/verify` with the transaction hash. The server reads the transaction from a Nimiq RPC node (or a Polygon RPC node for USDT) and checks:
   - it succeeded and is in a block (for Polygon, at least 5 confirmations);
   - it pays the merchant's address;
   - for NIM, the data matches the invoice reference;
   - the value is at least the quoted amount, and it was sent before the quote expired (plus a short grace period).
4. Each transaction hash can pay **only one** invoice (database unique constraint).
5. If the client closes the app before confirmation, the merchant's dashboard finds the payment later by scanning the merchant's recent transactions for the invoice reference.

## Non-custodial cheques

![Diagram: a link key from the URL fragment and a server key combine into a 2-of-2 Ed25519 cheque wallet; the recipient cashes it or the writer cancels it.](docs/readme/cheque.png)

A NimBill cheque lets you hand someone NIM (or an amount priced in any of the 19 supported currencies, converted at the live rate and locked inside as NIM) as a shareable link, QR code, or `CHQ-…` code, without asking for their wallet address first, and pre-funded on-chain so it never bounces:

- **Two ways to write one.** Make it a **free cheque** (the first person with the link or code claims the full amount) or lock it to a specific **`@tag`** (pinned to that user's wallet at the moment the cheque is written).
- **2-of-2 Ed25519 key splitting (`A_cheque = A_link + A_server`).** Every cheque is its own throwaway Nimiq wallet whose public key combines a browser-generated link half (`A_link`) and a deterministic server half (`A_server`). The 24-character link secret lives only in the URL `#fragment`, so it never reaches NimBill's server. That means NimBill can never move a cheque's funds on its own, while nobody can bypass `@tag` rules with a raw RPC call.
- **Two-party Schnorr signing (`prepare` → `broadcast`).** Cashing (or the writer tapping **Cancel & take back** to reclaim an uncashed cheque) co-signs a zero-fee Nimiq transaction in the browser with no custom smart contracts required.
- **30-day on-chain HTLC timeout refund.** Once funded, the cheque locks its NIM in a native Nimiq **Hashed Time-Locked Contract (HTLC)** (`recipient = A_cheque`, `sender = A_refund`, derived from a separate refund key that only the writer keeps and that is never part of the link). Even if NimBill's server went offline forever, after 30 days the writer can use that refund key to broadcast a Nimiq `TimeoutResolve` transaction directly to any RPC node and reclaim 100% of their NIM without NimBill. Whoever holds the link can't, so a `@tag` lock still holds after the timeout.

> **Want to know more about how we built the cheque system?** Read the full deep-dive blog post: [**How we built non-custodial cheques on Nimiq →**](https://nimbill.mblob.me/blog/how-we-built-cheques) (also readable right in this repo at [`docs/cheques.md`](docs/cheques.md)).

## Pay with NimBill: webhooks for online stores

![Sequence diagram: your store creates a signed invoice on NimBill, the customer opens it and pays wallet to wallet, the NimBill worker confirms the payment on-chain, and your store receives a signed invoice.paid webhook. Beside it, the Settings → Webhooks screen.](docs/readme/webhooks.png)

Take NIM and USDT in your own shop without NimBill ever holding the money. There is **no API key**: one webhook secret signs both ways.

1. **Turn it on** in Settings → Webhooks: your https webhook URL and, optionally, your store's address. The secret is shown once and stored encrypted.
2. **Your server creates the invoice** with [`POST /api/pay/{tag}/invoices`](https://nimbill.mblob.me/docs/api/create-board-invoice), signed with the secret, adding your order `reference`, `metadata` and a `returnUrl` back to your store.
3. **The customer pays** at `/i/{id}` from Nimiq Pay or any wallet, and a **Back to your shop** button returns them.
4. **Your server gets `invoice.paid`**, signed the same way and retried for about 3 days until it answers 2xx. **Send test event** delivers a `webhook.test`, so you can check your handler without paying.
5. **Or `invoice.expired`** if nobody paid in time (24 hours, or `expiresInMinutes`), so you can release the stock; never after `invoice.paid`. **`invoice.payment_issue`** says NIM arrived for an invoice but didn't pay it: too little, too late, or a second payment. Pick which of the three you receive in Settings → Webhooks.

```text
NimBill-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
```

<details>
<summary>Verify a webhook in Node.js</summary>

```js
import { createHmac, timingSafeEqual } from "node:crypto";

// header: the NimBill-Signature header; rawBody: the request body exactly as received.
export function isFromNimBill(header, rawBody, secret) {
  const parts = header.split(",").map((p) => p.split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false; // older than 5 minutes
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"));
  // While a rotated-out secret is still valid, there is one v1= per secret.
  return parts.some(([k, v]) => k === "v1" && v.length === expected.length && timingSafeEqual(Buffer.from(v), expected));
}
```

Then find the order by the `invoice.id` you saved, check the total and currency, and skip event ids you have already handled (delivery is at least once).

</details>

- **A worker you run next to the app** ([`worker/`](worker/README.md), `bun run worker` or its Dockerfile). It opens no port: it delivers queued events, watches the chain for store payments (so a closed tab doesn't matter), and re-queues any paid store invoice that is missing its webhook.
- **Safe outgoing requests.** Webhooks only go to public https hosts; the resolved address is checked and pinned, and redirects are not followed.
- **Rate limits you can read.** Limited endpoints answer with `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` (plus `Retry-After` on 429), readable from other sites too. Signed store requests get their own, larger allowance.

Full guide: [Pay with NimBill](https://nimbill.mblob.me/docs/webhooks).

## Developer docs

![The NimBill docs: an endpoint page with a sidebar, method badges and an "On this page" list; the search dialog; and the sidebar as a drawer on a phone.](docs/readme/docs.png)

[`/docs`](https://nimbill.mblob.me/docs), [`/ai`](https://nimbill.mblob.me/ai) and [`/mcp`](https://nimbill.mblob.me/mcp) share one docs layout built into the app, so everything stays one Vercel project:

- **Find things fast.** A sidebar per area, search over every page and heading (Ctrl K), an "On this page" list that follows your scroll, and Previous/Next links. On a phone the sidebar becomes a drawer.
- **A page per endpoint.** [Read a board](https://nimbill.mblob.me/docs/api/get-board), [create an invoice](https://nimbill.mblob.me/docs/api/create-board-invoice), [lock the price](https://nimbill.mblob.me/docs/api/create-quote), [confirm the payment](https://nimbill.mblob.me/docs/api/verify-payment) and more, each with its fields, an example request in **curl, JavaScript and Python** (your choice is remembered), an example response and its errors.
- **One source of truth.** The endpoint pages, `/openapi.json`, `/llms.txt`, `/skill.md` and every board's `howToPay` are generated from the same files (`src/lib/api-reference.ts`, `src/lib/agent-docs.ts`), so they can't disagree.
- Start with the [quick start](https://nimbill.mblob.me/docs/quick-start): buy a product from a board with five requests.

## Built for AI agents

![The AI assistants page with setup guides, and the MCP tools reference grouped by category.](docs/readme/agents.png)

- **Set up any assistant** at [`/ai`](https://nimbill.mblob.me/ai): a skill for [Claude](https://nimbill.mblob.me/ai/claude), a custom GPT action for [ChatGPT](https://nimbill.mblob.me/ai/chatgpt), a project rule for [Cursor](https://nimbill.mblob.me/ai/cursor), and instructions for [Grok, Gemini and other chats](https://nimbill.mblob.me/ai/other). Every board's JSON also includes the exact steps to pay it.
- **Machine-readable.** [`/llms.txt`](https://nimbill.mblob.me/llms.txt), [`/openapi.json`](https://nimbill.mblob.me/openapi.json) and [`/skill.md`](https://nimbill.mblob.me/skill.md).
- **CORS for browser agents.** The public endpoints allow cross-site requests. Signed-in endpoints and owner actions stay closed to other sites.
- **MCP agent wallet** ([`nimbill-mcp`](https://www.npmjs.com/package/nimbill-mcp) on npm). Gives Claude, Cursor, Windsurf or Antigravity its own non-custodial Nimiq wallet and `@tag`, with [15 tools](https://nimbill.mblob.me/mcp/tools) to pay invoices, buy from boards, send NIM by tag, and write or cash cheques on-chain. Spending limits and an encrypted key file are built in. See [Connect your AI](https://nimbill.mblob.me/mcp/connect) and [`mcp/README.md`](mcp/README.md).

```bash
claude mcp add nimbill -e NIMBILL_URL=https://nimbill.mblob.me -- npx -y nimbill-mcp
```

## How it uses Nimiq Pay

| Feature                                             | Nimiq Pay API                                                                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Passwordless sign-in (proves wallet ownership)      | `nimiq.sign()`, verified server-side (Ed25519 over the Nimiq signed-message hash; address derived from the public key) |
| Pay an invoice in NIM, with the invoice ID on-chain | `nimiq.sendBasicTransactionWithData({ recipient, value, data: "NimBill <id>" })`                                       |
| Pay an invoice in USDT (Polygon)                    | `window.ethereum`: `wallet_switchEthereumChain`, `eth_call` balance checks, `eth_sendTransaction` (ERC-20 `transfer`)  |
| Stake earnings                                      | `nimiq.sendNewStakerTransaction()` / `nimiq.sendStakeTransaction()`, `nimiq.getBalance()`                              |
| Unstake and withdraw                                | `nimiq.sendSetActiveStakeTransaction()`, `nimiq.sendRetireStakeTransaction()`, `nimiq.sendRemoveStakeTransaction()`    |
| Withdraw NIM as USDC / USDT on another chain        | `nimiq.payLightningInvoice({ invoice })` (a Lendaswap hold invoice)                                                    |
| Default invoice currency                            | `getHostFiat()`                                                                                                        |
| Open links inside the app                           | `https://nimpay.app/miniapps/open/<url>` deep links                                                                    |

All wallet actions are triggered by an explicit tap. Cancelling a dialog shows a calm message and keeps your place. Outside Nimiq Pay, clients can still pay from any Nimiq wallet with a `nimiq:` payment link or QR code, and the invoice is matched by its on-chain reference.

## Works outside Nimiq Pay too

![The NimBill landing page on a desktop browser and on a phone.](docs/readme/landing.png)

In a desktop browser the app works too, but wallet actions show an "Open in Nimiq Pay" prompt.

## Tech stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS 4), mobile-first
- **@nimiq/mini-app-sdk** for the Nimiq provider; **viem** for ERC-20 encoding
- **Postgres** via Drizzle ORM: [Neon](https://neon.tech) in production, embedded [PGlite](https://pglite.dev) locally (zero setup)
- **Nimiq RPC** ([rpc.nimiqwatch.com](https://rpc.nimiqwatch.com)), **Polygon RPC**, **NEAR Intents 1Click API** (cross-chain payins), **Lendaswap** (withdrawals), **CoinGecko** prices and the **Nimiq Validators API**
- `@noble/curves` and `@noble/hashes` for signature verification and cheque keys
- A small **webhook worker** (Node, no build step, no open port) that runs the app's own code from `src/lib`

## Run locally

```bash
bun install
cp .env.example .env.local   # set DEMO_MERCHANT_ADDRESS to your Nimiq address
bun run dev -- -H 0.0.0.0
```

Open `http://<your-computer's-LAN-IP>:3000` in Nimiq Pay → Mini Apps → Custom URL (your phone must be on the same Wi-Fi).

To try webhooks locally, also run the worker (see [`worker/README.md`](worker/README.md) for sharing the database with the dev server):

```bash
bun run worker
```

Tests:

```bash
bun run test            # every test in tests/: no database, dev server or secrets needed (what CI runs)
bun run test tests/mcp.test.mjs   # one file, e.g. the MCP agent wallet's tools
bun run test:api        # 130+ end-to-end API checks against the running dev server, simulating wallets with throwaway keys
```

Git hooks ([hk](https://hk.jdx.dev), configured in `hk.pkl`): before a commit, the staged files are formatted and linted; before a push, the same checks as CI run, then the tests your branch can reach. Install hk once (`mise use hk`, `brew install hk` or a [release binary](https://github.com/jdx/hk/releases)), then run `hk install` in this folder.

## Deploy (Vercel + Neon)

1. Push this repo to GitHub (public, MIT).
2. Create a free Postgres database on [neon.tech](https://neon.tech) and copy the connection string.
3. Import the repo on [vercel.com/new](https://vercel.com/new) and add these environment variables: `DATABASE_URL`, `SESSION_SECRET` (32+ random characters), `CHEQUE_KEY_SECRET` (recommended: 32+ random characters, never rotate it while cheques are open), `DEMO_MERCHANT_ADDRESS` (your Nimiq address), and `WEBHOOK_KEY_SECRET` (32+ random characters) if stores will use webhooks. Tables are created automatically on first request.
4. Open `https://<your-app>.vercel.app` in Nimiq Pay → Mini Apps → Custom URL, and pay the sample invoice to check it end to end.
5. For webhooks, run the worker on any container host (Fly.io, Railway, Render, a VPS) with the same `DATABASE_URL` and `WEBHOOK_KEY_SECRET`, plus `SITE_URL`: `docker build -f worker/Dockerfile -t nimbill-worker .` ([details](worker/README.md)).

## Security notes

- No private keys or secrets are in the code. `SESSION_SECRET` and `DATABASE_URL` come from environment variables.
- Sessions are HMAC-signed, httpOnly cookies. Sign-in challenges are single-purpose, expire after 5 minutes and are bound to the host.
- Invoice links use unguessable random IDs. The public view never exposes the client's email or the merchant's notification email, and neither is written to logs.
- USDT has no on-chain memo, so a USDT payment is matched by recipient, amount and time window, and each transaction hash can be used only once.
- Cheque link secrets stay in the URL fragment and never reach the server, so a cheque can't be cashed or moved by NimBill alone.
- Store webhook secrets are encrypted at rest with `WEBHOOK_KEY_SECRET`, shown only once, and can be rotated with a 24-hour overlap. A leaked secret can only create invoices that pay the merchant.
- Webhooks are only sent to public https hosts; the resolved address is pinned and redirects are not followed.

## Roadmap

Recurring invoices · multi-language (via `window.nimiqPay.language`) · cash-outs to local bank / mobile money through licensed partners (waitlist open) · more withdrawal chains (Base, Optimism, Solana, Tron).

## Resources

|                        |                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Try it**             | [Live app](https://nimbill.mblob.me) · [96-second demo video](demo/nimbill-demo.mp4) ([storyboard](demo/STORYBOARD.md)) · [Live usage with on-chain proof](https://nimbill.mblob.me/stats)                                                                                                                                                                          |
| **Developer docs**     | [Introduction](https://nimbill.mblob.me/docs) · [Quick start](https://nimbill.mblob.me/docs/quick-start) · [How payments work](https://nimbill.mblob.me/docs/how-it-works) · [Board API](https://nimbill.mblob.me/docs/api) · [Sending the payment](https://nimbill.mblob.me/docs/sending) · [Safety and limits](https://nimbill.mblob.me/docs/safety)              |
| **Pay with NimBill**   | [Webhooks guide](https://nimbill.mblob.me/docs/webhooks) · [Worker README](worker/README.md) · [Introducing Pay with NimBill](https://nimbill.mblob.me/blog/pay-with-nimbill)                                                                                                                                                                                       |
| **Cheques**            | [How we built non-custodial cheques on Nimiq](https://nimbill.mblob.me/blog/how-we-built-cheques) ([`docs/cheques.md`](docs/cheques.md)) · [Write or cash a cheque](https://nimbill.mblob.me/cheques)                                                                                                                                                               |
| **Pay from any chain** | [Pay from any chain (blog post)](https://nimbill.mblob.me/blog/pay-from-any-chain) · [How it works, coins and limits](docs/pay-from-other-chains.md) · [NEAR Intents 1Click API](https://docs.near-intents.org/integration/distribution-channels/1click-api)                                                                                                        |
| **Withdrawals**        | [From money in to money out (blog post)](https://nimbill.mblob.me/blog/money-in-to-money-out) · [Setup, safety and the first real test](docs/withdrawals.md) · [Lendaswap](https://lendaswap.com)                                                                                                                                                                   |
| **AI assistants**      | [Overview](https://nimbill.mblob.me/ai) · [Claude](https://nimbill.mblob.me/ai/claude) · [ChatGPT](https://nimbill.mblob.me/ai/chatgpt) · [Cursor](https://nimbill.mblob.me/ai/cursor) · [Grok, Gemini and others](https://nimbill.mblob.me/ai/other) · [Your own agent](https://nimbill.mblob.me/ai/own-agent)                                                     |
| **MCP agent wallet**   | [Overview](https://nimbill.mblob.me/mcp) · [Connect your AI](https://nimbill.mblob.me/mcp/connect) · [Fund your agent](https://nimbill.mblob.me/mcp/funding) · [All 15 tools](https://nimbill.mblob.me/mcp/tools) · [Security](https://nimbill.mblob.me/mcp/security) · [npm package](https://www.npmjs.com/package/nimbill-mcp) · [`mcp/README.md`](mcp/README.md) |
| **Machine-readable**   | [llms.txt](https://nimbill.mblob.me/llms.txt) · [openapi.json](https://nimbill.mblob.me/openapi.json) · [skill.md](https://nimbill.mblob.me/skill.md)                                                                                                                                                                                                               |
| **Nimiq**              | [Nimiq Pay](https://nimiq.com/nimiq-pay) · [Mini App SDK](https://www.npmjs.com/package/@nimiq/mini-app-sdk) · [Mini Apps Competition, Cycle III](https://miniappscompetition.com/cycle3)                                                                                                                                                                           |

## About the screenshots

The screens above are the real NimBill interface, captured at phone and desktop size from a local development server with a throwaway test account (the webhook URL shown is a sample). The earnings history on the dashboard is sample data, and the wallet confirmation, cross-chain deposit and "paid" results are simulated (no real NIM or USDT moved). On the Withdraw screens the NIM balance is a sample; the quote is live from Lendaswap, and nothing was paid. To see a real payment, pay the sample invoice in the [live app](https://nimbill.mblob.me).

## License

[MIT](LICENSE)
