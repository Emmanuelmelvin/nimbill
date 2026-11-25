# NimBill webhook worker

Sends "Pay with NimBill" webhooks. It runs as its own process, separate from the web app, and is
**not exposed to the internet**: it opens no port. It only talks to the same Postgres database as the
web app and makes outgoing HTTPS requests.

| Job        | Every | What it does                                                                                                                                                                       |
| ---------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deliver`  | 2 s   | Sends queued `webhook_events`, signed with the merchant's secret, and retries for ~3 days                                                                                          |
| `watch`    | 15 s  | Looks on-chain for payments to store invoices, so a shopper closing the tab doesn't matter, and for NIM that carried an invoice's memo but didn't pay it (`invoice.payment_issue`) |
| `expire`   | 60 s  | Marks store invoices past their expiry `expired` once no price lock can still be paid, and queues `invoice.expired`                                                                |
| `sweep`    | 60 s  | Queues `invoice.paid` / `invoice.expired` for any paid or expired store invoice that is missing one                                                                                |
| `health`   | 5 min | Warns merchants whose URL has failed for 24 h, removes it after 5 days (emails both times)                                                                                         |
| `withdraw` | 5 s   | Moves open withdrawals forward: claims swaps (gasless), confirms delivery on-chain. Only with `WITHDRAW_LIVE=true`                                                                 |
| `stuck`    | 5 min | Logs withdrawals paid but not delivered after 30 minutes. Only with `WITHDRAW_LIVE=true`                                                                                           |
| `payin`    | 10 s  | Follows payments from other chains (Tron, BNB Chain, Solana…): marks the invoice paid once the USDT reaches the merchant on Polygon. Off with `PAYIN_LIVE=false`                   |

The worker runs the web app's own code from `src/lib` (the same payment matching, the same schema),
so the two can't disagree about whether an invoice is paid. Node runs the TypeScript directly; there
is no build step.

## Environment

| Variable                               | Required  | Notes                                                                                                                      |
| -------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                         | yes       | The **same** Postgres database as the web app                                                                              |
| `WEBHOOK_KEY_SECRET`                   | yes       | The **same** value as the web app (it decrypts the stores' secrets)                                                        |
| `SITE_URL`                             | yes       | The web app's public address, e.g. `https://nimbill.example`, for links                                                    |
| `NODE_ENV`                             | yes       | `production` (the Docker image sets it)                                                                                    |
| `NIMIQ_RPC_URL`                        | no        | Same defaults as the web app                                                                                               |
| `POLYGON_RPC_URL`                      | no        |                                                                                                                            |
| `COINGECKO_API_KEY`                    | no        | USD values of payments                                                                                                     |
| `RESEND_API_KEY`, `MAIL_FROM`          | no        | "Invoice paid" emails for payments the worker finds                                                                        |
| `LOG_LEVEL`, `NEXT_PUBLIC_SENTRY_DSN`  | no        | Logs and error reports                                                                                                     |
| `WITHDRAW_LIVE`                        | no        | `true` to run real withdrawals. Same value as the web app                                                                  |
| `WITHDRAW_MNEMONIC`                    | with live | The **same** recovery phrase as the web app (it claims the swaps). See [withdrawals](../docs/withdrawals.md)               |
| `ETHEREUM_RPC_URL`, `ARBITRUM_RPC_URL` | no        | Confirm withdrawals on those chains. Defaults: publicnode, arb1                                                            |
| `PAYIN_LIVE`, `ONECLICK_API_KEY`       | no        | Payments from other chains. Same values as the web app. See [payments from other chains](../docs/pay-from-other-chains.md) |

## Run it

Locally:

```bash
bun run worker
```

Run each job once and exit (handy for checking a setup):

```bash
bun run worker -- --once
```

Locally, give the web app and the worker the same Postgres `DATABASE_URL` (a local Postgres or a
Neon dev branch). The embedded development database (`.data/pglite`) can only be open in **one**
process: with it, stop `bun run dev` first and pass `--embedded-db` (the worker refuses to start on
it otherwise, because two processes on it overwrite each other's data):

```bash
bun run worker -- --embedded-db --once
```

## Deploy

Any host that runs a container works (Fly.io, Railway, Render, a VPS). Build from the project folder:

```bash
docker build -f worker/Dockerfile -t nimbill-worker .
```

Run one instance; more are safe (events are claimed with `FOR UPDATE SKIP LOCKED`), just not needed.
Don't give it a public port or a health-check URL: it has none.

## What stores receive

```
POST <webhook URL>
Content-Type: application/json
User-Agent: NimBill-Webhooks/1.0
NimBill-Signature: t=1763112000,v1=5f2c…
NimBill-Event-Id: evt_…
NimBill-Event-Type: invoice.paid
NimBill-Delivery-Attempt: 1

{ "id": "evt_…", "type": "invoice.paid", "createdAt": "…", "test": false,
  "data": { "invoice": { "id": "…", "number": "INV-0042", "status": "paid", "reference": "order-42",
                         "metadata": {…}, "total": "25.00", "currency": "USD", "payment": {…}, … } } }
```

- Check `NimBill-Signature`: hex HMAC-SHA256 of `"<t>.<raw body>"` with the webhook secret, and reject
  it when `t` is more than 5 minutes off. During a secret rotation there are two `v1=` values; accept
  either one.
- Answer with any 2xx within 10 seconds. Anything else, or no answer, is retried after 1 min, 5 min,
  15 min, 1 h, 3 h, 6 h, 12 h, 24 h and 24 h, then the event is marked failed.
- Delivery is **at least once**: drop duplicates by the event `id`.
- Match the webhook to your order by the `invoice.id` you saved when you created it, and check
  `total` and `currency`. `reference` is your own label.
- Redirects are not followed, and URLs that resolve to private or local addresses are refused.
