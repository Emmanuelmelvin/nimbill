# Withdrawals: setup and the first real test

NimBill lets a user turn NIM (or USDT) into USDC or USDT on Polygon, Ethereum or Arbitrum. Nimiq Pay
pays a Lightning invoice, and [Lendaswap](https://lendaswap.com) (by Satora) delivers the stablecoin
through an atomic swap. NimBill never holds the user's money.

Withdrawals are **off** unless `WITHDRAW_LIVE=true`. While off, the Withdraw screen shows sample
quotes and nothing can be paid. Turn them on in a test deployment first, and on production only after
the test below passes.

## How one withdrawal moves money

1. **Quote.** NimBill asks Lendaswap what the user pays over Lightning to receive exactly the amount.
2. **Approve.** NimBill creates the swap. The Lendaswap SDK picks a secret only NimBill knows (from
   the recovery phrase) and sends its hash. Lendaswap returns a Lightning **hold** invoice.
3. **Pay.** Nimiq Pay pays that invoice with the user's NIM, after the user approves. The payment is
   held by Lendaswap, not taken.
4. **Lock.** Lendaswap locks WBTC on the destination chain for that hash.
5. **Claim.** NimBill (the worker, or the web app while the user watches) reveals the secret in a
   gasless claim. Lendaswap's coordinator swaps the WBTC into USDC/USDT and sends it to the
   user's address, which was fixed in step 2.
6. **Settle.** Only now can Lendaswap complete the held Lightning payment.
7. **Confirm.** NimBill marks it delivered once the transfer is in a **final** block on the chain.

If anything stops before step 5, the held payment is cancelled and the money goes back to the user.

| Code                            | What it does                                                  |
| ------------------------------- | ------------------------------------------------------------- |
| `src/lib/withdraw/service.ts`   | Quote, create, and `advance` (moves a withdrawal forward)     |
| `src/lib/withdraw/lendaswap.ts` | The Lendaswap SDK (`@lendasat/lendaswap-sdk-pure`)            |
| `src/lib/withdraw/storage.ts`   | The SDK's keys and swaps, in Postgres, swap records encrypted |
| `src/lib/withdraw/evm.ts`       | Confirms delivery on-chain                                    |
| `worker/index.ts`               | `withdraw` (every 5 s) and `stuck` (every 5 min) jobs         |

## Setup

1. **Make a recovery phrase**, on your own computer:

   ```bash
   bun run withdraw:new-phrase
   ```

   Write the 12 words down and keep them **offline**. They derive every swap's secret. Without them
   a withdrawal in progress can't be claimed; anyone with them could claim one. Never change the
   phrase while a withdrawal is in progress.

2. **Web app** (the Vercel project you test with): set
   - `WITHDRAW_LIVE` = `true`
   - `WITHDRAW_MNEMONIC` = the phrase

3. **Worker** (Fly): set the same two, with the **same** phrase:

   ```bash
   fly secrets set WITHDRAW_LIVE=true WITHDRAW_MNEMONIC="word1 word2 … word12"
   ```

   The worker finishes withdrawals when the user has closed NimBill. Without it, a withdrawal only
   moves forward while someone has its progress screen open.

4. Optional: `ETHEREUM_RPC_URL`, `ARBITRUM_RPC_URL`, `POLYGON_RPC_URL` with your own RPC keys if the
   public ones are slow.

Check the setup without spending anything (it creates one unpaid 2 USDC swap that simply expires):

```bash
bun run test:withdraw-live -- --create
```

## The first real test (about $2)

Do this in the test deployment, opened in **Nimiq Pay** (approving needs it).

1. Withdraw → Crypto → pay with **NIM** → **Polygon** → **USDC** → your own address → **2** USDC.
2. On Review, note "You send about … NIM". Tap **Approve in Nimiq Pay**.
3. In Nimiq Pay, note the exact NIM and fee it shows, then approve.
4. Watch the progress screen: Paying → Swapping → Delivering → Done. Note the time each step took.
5. Check the USDC arrived (the receipt links to Polygonscan).

Write down, and send to the developer:

- The NIM Nimiq Pay charged, versus the "about" figure NimBill showed
- How long each step took
- The withdrawal reference (`wd_…`) from the receipt

Then repeat once with **USDT** as "Pay with", and once with a **declined** approval (it should say
"Cancelled. Nothing was spent.").

## When something goes wrong

- The progress screen shows the withdrawal reference (`wd_…`). Its row in the `withdrawals` table
  has the Lendaswap swap ID (`provider_swap_id`), Nimiq Pay's payment hash and swap ID, and the full
  status history.
- `refunded`: Lendaswap cancelled the held payment; Nimiq Pay returns the money to the user.
- `failed`: needs a person. The worker logs `withdrawal needs a human` with the swap ID.
- Anything paid but not delivered after 30 minutes is logged as `withdrawal stuck`.
