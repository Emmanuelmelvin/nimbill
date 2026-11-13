# NimBill — invoices paid in NIM & USDT

A [Nimiq Pay](https://nimiq.com/nimiq-pay) Mini App for freelancers and small businesses: **invoice clients in your local currency, get paid in NIM or USDT straight to your wallet, with every payment verified on-chain.**

Built for the [Nimiq Mini Apps Competition — Cycle III](https://miniappscompetition.com/cycle3), **Pay** category.

## What it does

- **Create an invoice in your currency.** Naira, Shillings, Cedis, Euros, Rupees and 14 more. Line items, due date, note.
- **Share one link.** It opens the invoice in Nimiq Pay (WhatsApp, the share sheet, a QR code for in-person payments, or copy).
- **Client pays in a few taps.** No account needed. The fiat total is converted at the live rate and **locked for 5 minutes**. Payment goes wallet-to-wallet: NimBill never holds funds.
- **Verified on the blockchain.** The server checks the transaction on-chain (recipient, amount, invoice reference) before marking the invoice paid. A returned hash is never trusted on its own.
- **Receipts you can show an accountant.** The receipt includes the exchange rate used, both addresses and a link to the transaction. Download it as a PDF.
- **Know when you are paid.** Add an email in Settings (optional) and NimBill emails you once when an invoice is paid. Needs `RESEND_API_KEY` on the server; without it no email is sent.
- **Stake what you earn.** After a NIM payment, the freelancer can stake it with a top-rated staking pool in one tap. The dashboard shows what is staked and with which pool, and lets them stake more, unstake, and move unstaked NIM back to the wallet once the waiting period ends.
- **Try it in 30 seconds.** "Pay a sample invoice" walks anyone through the full flow for about $0.05.
- **Public usage page** (`/stats`). Every paid invoice links to its on-chain transaction.
- **A tag instead of an address.** Every user claims a tag like `ada@nimbill`. Lookalike-safe rules, reserved names, and a given-up tag stays held for its owner for 90 days.
- **Send money by tag.** Type a tag, check the name and address it belongs to, and send NIM (amount in NIM or any supported currency). Transfers are verified on-chain like invoices and listed under Invoices → Transfers, apart from earnings.
- **A public pay page.** `/pay/<tag>` lets anyone pay you without an account: an amount for something, or one of your products (with a quantity). Visitors' invoices get your next `INV-` number only once paid, so unpaid ones never leave gaps; they live under Board → Orders.
- **Products.** Name, price, description and a picture (shrunk in the browser and stored in the database, so there is no file storage to set up). Hide or delete any time.
- **Built for AI agents.** Every board's JSON includes the exact steps to pay it. `/docs` explains the API with examples and copy-paste setups for Claude (a skill), Cursor (a rule), ChatGPT (a custom GPT action) and Grok/Gemini. Machine-readable: `/llms.txt`, `/openapi.json`, `/skill.md`. The public endpoints allow cross-site requests (CORS), so agents running in a browser can use them too; signed-in endpoints and owner actions stay closed to other sites.
- **Cheques** (`/cheques`, `/c/<id>`). Write a cheque in NIM or any supported currency — either locked to a specific `@tag` or open as a free cheque where the first person with the link, QR code or `CHQ-…` code claims it. Each cheque is a non-custodial 2-of-2 Ed25519 Nimiq wallet (`A_cheque = A_link + A_server`): NimBill never receives the link secret (kept in the URL `#fragment`), so NimBill can never move the funds on its own, while the writer can cancel and reclaim an uncashed cheque at any time.

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

## How payment verification works

1. The client taps **Get price**. The server creates a quote: the fiat total ÷ the live CoinGecko rate, rounded **up** so the merchant never gets less than invoiced. The quote expires after 5 minutes.
2. The wallet sends the exact amount. NIM payments carry `NimBill <invoiceId>` as transaction data.
3. The client polls `/api/invoices/:id/verify` with the transaction hash. The server reads the transaction from a Nimiq RPC node (or a Polygon RPC node for USDT) and checks:
   - it succeeded and is in a block (for Polygon, at least 5 confirmations);
   - it pays the merchant's address;
   - for NIM, the data matches the invoice reference;
   - the value is at least the quoted amount, and it was sent before the quote expired (plus a short grace period).
4. Each transaction hash can pay **only one** invoice (database unique constraint).
5. If the client closes the app before confirmation, the merchant's dashboard finds the payment later by scanning the merchant's recent transactions for the invoice reference.

## Tech stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS 4), mobile-first
- **@nimiq/mini-app-sdk** for the Nimiq provider; **viem** for ERC-20 encoding
- **Postgres** via Drizzle ORM: [Neon](https://neon.tech) in production, embedded [PGlite](https://pglite.dev) locally (zero setup)
- **Nimiq RPC** ([rpc.nimiqwatch.com](https://rpc.nimiqwatch.com)), **Polygon RPC**, **CoinGecko** prices and the **Nimiq Validators API**
- `@noble/curves` and `@noble/hashes` for signature verification

## Run locally

```bash
npm install
cp .env.example .env.local   # set DEMO_MERCHANT_ADDRESS to your Nimiq address
npm run dev -- -H 0.0.0.0
```

Open `http://<your-computer's-LAN-IP>:3000` in Nimiq Pay → Mini Apps → Custom URL (your phone must be on the same Wi-Fi). In a desktop browser the app works too, but wallet actions show an "Open in Nimiq Pay" prompt.

Tests:

```bash
npm run test:api        # 130+ end-to-end API checks against the running dev server, simulating wallets with throwaway keys
npm run test:tags       # tag rules, request validation, agent docs and the OpenAPI spec
npm run test:earnings   # earnings and goals maths
npm run test:address    # Nimiq address derivation
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

## Roadmap

USDT transfers by tag · webhooks for paid invoices · recurring invoices and reminders · multi-language (via `window.nimiqPay.language`) · payouts to local bank / mobile money through licensed partners.

## License

[MIT](LICENSE)
