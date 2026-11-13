<p align="center">
  <img src="docs/readme/banner.png" alt="NimBill: invoice in your currency, get paid in NIM or USDT. Three phone screens: the earnings dashboard, a client's locked price quote, and a payment confirmed on the Nimiq blockchain." width="100%">
</p>

<p align="center">
  <a href="https://nimbill.mblob.me"><b>Live app</b></a> ·
  <a href="demo/nimbill-demo.mp4"><b>96-second demo video</b></a> ·
  <a href="https://nimbill.mblob.me/docs"><b>API docs</b></a> ·
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

|                                   |                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| **No account for clients**        | They open one link in Nimiq Pay and pay in a few taps.                                    |
| **Wallet to wallet**              | NimBill never holds funds.                                                                |
| **Verified on-chain**             | The server reads every payment from the blockchain before an invoice is marked paid.      |
| **19 currencies**                 | Naira, Shillings, Cedis, Euros, Rupees and more, at a live rate locked for 5 minutes.     |
| **Made for people and AI agents** | A public JSON API, an OpenAPI spec, and an MCP server that gives an agent its own wallet. |

## How it works

![Four steps: create an invoice in Naira, share a link or QR code, the client pays at a locked NIM price, and the payment is confirmed on the Nimiq blockchain.](docs/readme/flow.png)

1. **Create.** Price the job in your currency. The live NIM total shows as you type.
2. **Share.** Send one link over WhatsApp, use the share sheet, show a QR code in person, or read out a short `NMN-` number.
3. **Pay.** The client taps **Get price**. The fiat total is converted at the live rate, rounded **up** so you never get less than you invoiced, and **locked for 5 minutes**.
4. **Verified.** The server checks the transaction on the blockchain, then both sides get a receipt with the rate used and a link to the transaction.

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
- **Cheques** (`/cheques`, `/c/<id>`). Write a cheque in NIM or any supported currency, either locked to one `@tag` or open to the first person with the link, QR code or `CHQ-…` code. [How cheques stay non-custodial ↓](#non-custodial-cheques)
- **Receipts that hold up.** The rate used, both addresses and a link to the transaction. Download as PDF.
- **Public usage page** (`/stats`). Every paid invoice links to its on-chain transaction.

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

Each cheque is its own 2-of-2 Ed25519 Nimiq wallet (`A_cheque = A_link + A_server`). The link secret lives only in the URL `#fragment`, so it never reaches NimBill's server. NimBill can therefore never move the funds on its own, and the writer can cancel and reclaim an uncashed cheque at any time.

## Built for AI agents

![The NimBill API docs page and the MCP agent wallet page in browser windows.](docs/readme/agents.png)

- **HTTP API.** Every board's JSON includes the exact steps to pay it. [`/docs`](https://nimbill.mblob.me/docs) explains the API with examples and copy-paste setups for Claude (a skill), Cursor (a rule), ChatGPT (a custom GPT action) and Grok/Gemini. Machine-readable: `/llms.txt`, `/openapi.json`, `/skill.md`.
- **CORS for browser agents.** The public endpoints allow cross-site requests. Signed-in endpoints and owner actions stay closed to other sites.
- **MCP agent wallet** ([`nimbill-mcp`](https://www.npmjs.com/package/nimbill-mcp) on npm). Gives Claude, Cursor, Windsurf or Antigravity its own non-custodial Nimiq wallet and `@tag`, with 15 tools to pay invoices, buy from boards, send NIM by tag, and write or cash cheques on-chain. Spending limits and an encrypted key file are built in. See [`mcp/README.md`](mcp/README.md).

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
- **Nimiq RPC** ([rpc.nimiqwatch.com](https://rpc.nimiqwatch.com)), **Polygon RPC**, **CoinGecko** prices and the **Nimiq Validators API**
- `@noble/curves` and `@noble/hashes` for signature verification and cheque keys

## Run locally

```bash
npm install
cp .env.example .env.local   # set DEMO_MERCHANT_ADDRESS to your Nimiq address
npm run dev -- -H 0.0.0.0
```

Open `http://<your-computer's-LAN-IP>:3000` in Nimiq Pay → Mini Apps → Custom URL (your phone must be on the same Wi-Fi).

Tests:

```bash
npm run test:api        # 130+ end-to-end API checks against the running dev server, simulating wallets with throwaway keys
npm run test:tags       # tag rules, request validation, agent docs and the OpenAPI spec
npm run test:earnings   # earnings and goals maths
npm run test:address    # Nimiq address derivation
npm run test:mcp        # the MCP agent wallet's tools
```

## Deploy (Vercel + Neon)

1. Push this repo to GitHub (public, MIT).
2. Create a free Postgres database on [neon.tech](https://neon.tech) and copy the connection string.
3. Import the repo on [vercel.com/new](https://vercel.com/new) and add these environment variables: `DATABASE_URL`, `SESSION_SECRET` (32+ random characters), `CHEQUE_KEY_SECRET` (recommended: 32+ random characters, never rotate it while cheques are open), `DEMO_MERCHANT_ADDRESS` (your Nimiq address). Tables are created automatically on first request.
4. Open `https://<your-app>.vercel.app` in Nimiq Pay → Mini Apps → Custom URL, and pay the sample invoice to check it end to end.

## Security notes

- No private keys or secrets are in the code. `SESSION_SECRET` and `DATABASE_URL` come from environment variables.
- Sessions are HMAC-signed, httpOnly cookies. Sign-in challenges are single-purpose, expire after 5 minutes and are bound to the host.
- Invoice links use unguessable random IDs. The public view never exposes the client's email or the merchant's notification email, and neither is written to logs.
- USDT has no on-chain memo, so a USDT payment is matched by recipient, amount and time window, and each transaction hash can be used only once.
- Cheque link secrets stay in the URL fragment and never reach the server, so a cheque can't be cashed or moved by NimBill alone.

## Roadmap

Webhooks for paid invoices · recurring invoices · multi-language (via `window.nimiqPay.language`) · payouts to local bank / mobile money through licensed partners.

## About the screenshots

The screens above are the real NimBill interface, captured at phone size from a local development server with a throwaway test account. The earnings history on the dashboard is sample data, and the wallet confirmation and "paid" result are simulated (no real NIM moved). To see a real payment, pay the sample invoice in the [live app](https://nimbill.mblob.me).

## License

[MIT](LICENSE)
