# Competition submission draft (Cycle III, Pay category)

**Name:** NimBill
**Category:** Pay

## Description (≤ 250 words)

NimBill lets freelancers and small businesses invoice clients in their own currency and get paid in NIM or USDT, straight to their Nimiq Pay wallet.

Create an invoice in Naira, Shillings, Cedis, Euros or 15 other currencies, then share one link by WhatsApp, the share sheet or a QR code. Your client opens it in Nimiq Pay and pays in a few taps, with no account needed. The amount is converted at the live rate and locked for 5 minutes, and rounded up so you never receive less than you invoiced.

Every payment is verified on-chain before an invoice is marked paid. NIM payments carry the invoice reference in the transaction data, and the server checks the recipient, amount and reference against the blockchain. If a client closes the app early, NimBill still finds the payment. Both sides get a receipt with the exchange rate and a link to the transaction, ready for an accountant.

NimBill never holds funds: money goes wallet to wallet.

After a NIM payment, freelancers can stake their earnings with a top-rated pool in one tap, so NIM is not just accepted but put to work.

Nimiq Pay integration: wallet-signature sign-in (`sign`), NIM payments with on-chain references (`sendBasicTransactionWithData`), USDT on Polygon (`window.ethereum`), staking (`sendNewStakerTransaction` / `sendStakeTransaction`), balance checks (`getBalance`), host currency (`getHostFiat`) and deep links.

Try it: tap "Pay a sample invoice" for the full flow for about $0.05. Live usage, with on-chain proof: /stats

## Checklist before submitting

- [ ] Public GitHub repo with LICENSE (MIT): the copyright line names you
- [ ] Deployed on HTTPS (Vercel) with DATABASE_URL, SESSION_SECRET, DEMO_MERCHANT_ADDRESS set
- [ ] Paid the sample invoice yourself inside Nimiq Pay (mainnet), then checked that the receipt and /stats show it
- [ ] Sent real invoices to a few real clients or friends (Real usage = 15 points)
- [ ] Short demo video (optional but encouraged)
- [ ] Posted about it on X / Skool, tagging Nimiq (promotion checklist)
