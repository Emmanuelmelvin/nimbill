# Pay from another chain

Most clients don't have Nimiq Pay yet, but many hold USDT on Tron or BNB Chain. This option lets
them pay a NimBill invoice from any wallet or exchange. The freelancer receives **USDT on Polygon**
in their Nimiq Pay wallet, the same as a normal USDT payment.

## What the client sees

1. They open the invoice link (the plain NimBill link, `https://<nimbill>/i/<id>`) in any browser.
2. They can pick **Open in Nimiq Pay**, or **Pay from another chain or exchange**.
3. They pick a coin (for example USDT on Tron) and paste their own address on that chain, so a
   failed payment can go back to them.
4. NimBill shows a one-time address, the exact amount to send, and a 30-minute timer.
5. They send. A few minutes later the invoice shows as paid.

Inside Nimiq Pay the invoice goes straight to the normal payment. Nothing changes there.

## How it works

The swap is done by [NEAR Intents' 1Click API](https://docs.near-intents.org/integration/distribution-channels/1click-api).
NimBill never holds the money or any key. It only makes API calls and reads Polygon.

1. NimBill locks a USDT price for the invoice (`createQuote`), with its unique amount
   (`usdt-amounts.ts`), held for 50 minutes instead of 5.
2. It asks 1Click for an `EXACT_OUTPUT` quote: exactly that USDT amount must reach the merchant's
   Polygon address. 1Click returns a deposit address on the client's chain and how much to send.
   Its fees are paid by the client, on top.
3. The client sends. 1Click swaps it and pays the merchant on Polygon. If too little arrives,
   1Click sends it back to the refund address. The client is told to send within 30 minutes, but
   1Click keeps the address open for 72 hours more (`provider_deadline`), so a late payment can
   still go through. NimBill keeps watching until then (every 5 minutes after the first 30).
4. The pay screen (every 5 s) and the worker's `payin` job (every 10 s) read 1Click's status. When
   it reports the payout, `settleSwapPayment` checks that Polygon transaction: USDT to the
   merchant, at least the locked price, made after the price was locked. A late payment still
   counts: the swap ties it to this invoice. Then the invoice is marked paid
   through the same `markPaid` as every other payment, so emails, receipts and the
   `invoice.paid` webhook work as usual.

Each payment is a row in `payins`. It links the invoice, the price lock, the deposit address,
1Click's reference (`correlation_id`) and signature, and both transactions.

| Status                | Meaning                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| `awaiting_deposit`    | Waiting for the client to send                                            |
| `incomplete`          | Part arrived; more can be sent before the deadline, or it all goes back   |
| `swapping`            | Received; 1Click is paying the merchant                                   |
| `paid`                | The USDT reached the merchant and the invoice is paid                     |
| `delivered_unmatched` | The USDT reached the merchant, but the invoice was already paid or closed |
| `refunded`            | It couldn't go through; the money went back to the client                 |
| `failed`              | 1Click reports a failure. Look it up with the `correlation_id`            |
| `expired`             | Nothing arrived before the deadline                                       |

A refund never reached the merchant, so it sends no store webhook.

## Coins

`src/lib/payin/sources.ts`. Token ids come from `GET https://1click.chaindefuser.com/v0/tokens`.

| Kind                | Coins                                                                                                             | Buffer | Time to send |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- | ------ | ------------ |
| Dollar coins        | USDT on Tron, BNB Chain, Solana, Ethereum, Arbitrum; USDC on BNB Chain, Solana, Ethereum, Arbitrum, Base, Polygon | 0.5%   | 30 min       |
| Native, fast        | ETH (Ethereum, Arbitrum, Base), SOL, BNB, TRX, POL, AVAX                                                          | 2%     | 20 min       |
| Native, slow blocks | BTC, LTC, DOGE                                                                                                    | 3%     | 60 min       |

The merchant always receives exactly the locked USDT amount. A native coin's price can move
between making the address and the deposit arriving, so the amount to send carries a bigger
buffer. Whatever the swap doesn't need goes back to the client's refund address. If the price
moves by more than the buffer, the deposit is too small and all of it goes back instead.

XRP is left out: 1Click needs a destination tag with it, and payments from exchanges often get
that wrong.

## Settings

| Variable           | Default                           | Notes                                                                                    |
| ------------------ | --------------------------------- | ---------------------------------------------------------------------------------------- |
| `PAYIN_LIVE`       | `true`                            | `false` hides the option                                                                 |
| `ONECLICK_API_KEY` | none                              | Partner key from partners.near-intents.org. Without it 1Click adds 0.25% to each payment |
| `ONECLICK_API_URL` | `https://1click.chaindefuser.com` |                                                                                          |

Set the same values on the web app and the worker.

## Limits to know

- **Minimum amount.** Without a partner key, 1Click currently refuses payments under $100. The
  client is told so and pointed to Nimiq Pay.
- **Exchange fees.** If an exchange takes its withdrawal fee out of the amount sent, too little
  arrives and the payment is refunded. The screen tells the client to add the fee on top.
- **Payout in NIM.** Not offered. 1Click doesn't list NIM. The freelancer can swap USDT to NIM in
  Nimiq Pay.
