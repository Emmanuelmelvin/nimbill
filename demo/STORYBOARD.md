# NimBill demo video: storyboard and script

**Length:** 96 seconds · **Format:** 1920×1080, 30 fps, H.264 MP4 with a synthesised music bed · **Look:** black and white, sharp edges, Geist type (same as the app), one gold accent.

**Story in one line:** a freelancer in Lagos checks her earnings, invoices a client in Naira, the client pays in NIM from Nimiq Pay, the payment is checked on-chain, and she stakes what she earned.

**Cast:** Ada Studio (freelancer, phone on the right) and Acme Ltd (client, phone on the left).

On-screen captions carry the story, so the video works with the sound off. The voiceover lines are optional: record them over the finished video if you want a narrated version.

| # | Time | On screen | Caption | Voiceover (optional) |
|---|------|-----------|---------|----------------------|
| 1 | 0:00–0:05 | Black. Large type lands word by word, currency symbols drift behind, gold underline on "the hard part". | "You did the work." / "Getting paid shouldn't be the hard part." | "You did the work. Getting paid shouldn't be the hard part." |
| 2 | 0:05–0:10 | The receipt logo draws in, then the name. | "NimBill. Invoices paid in NIM & USDT." · "A Nimiq Pay Mini App" | "This is NimBill: invoices paid in NIM and USDT, inside Nimiq Pay." |
| 3 | 0:10–0:14 | Ada's phone slides in on the landing page. Tap "Start invoicing — sign in with Nimiq Pay". Home appears. | 01 · "Sign in with your wallet." Chip: `nimiq.sign()` | "Sign in by signing a message with your wallet. No password, no email." |
| 4 | 0:14–0:24 | Home: earnings chart (30D, Naira). Tap 1Y, then NIM. Scroll to the "November income" goal: on track, 59%. Tab bar pinned at the bottom. | 02 · "Know what you've earned." "One chart, in Naira, NIM or USDT. Set a monthly goal and track the pace." | "See every payment in one chart, in Naira, NIM or USDT, and track a monthly goal." |
| 5 | 0:24–0:36 | New invoice. Saved clients dropdown → Acme Ltd. Currency picker with flags → NGN. Item and price type in; the total shows "≈ … NIM today" (callout: LIVE RATE). Create. | 03 · "Invoice in your own currency." Chip: `getHostFiat()` | "Pick a saved client and price the job in Naira, Shillings, Cedis or Euros." |
| 6 | 0:36–0:43 | "Invoice created." Share panel, then the QR code. A WhatsApp-style message card flies to the client's phone. | 04 · "Share one link." | "Send one link, by WhatsApp or as a QR code in person." |
| 7 | 0:43–0:52 | Acme's phone: invoice → "Get price in NIM" → "You pay … NIM · Price locked for 5:00" (callout) → Pay → "Confirm in your wallet…". | 05 · "The client pays in a few taps." Chip: `sendBasicTransactionWithData()` | "The client needs no account. The rate is locked for five minutes, and the money goes wallet to wallet." |
| 8 | 0:52–1:00 | "Confirming your payment on the blockchain…" while four checks tick: right wallet · amount covers the locked price · invoice reference in the transaction · in a block. "Payment confirmed!" with confetti, "INVOICE MARKED PAID". | 06 · "Checked on the blockchain." "A transaction hash is never trusted on its own." | "NimBill checks the transaction on the blockchain before it marks anything paid." |
| 9 | 1:00–1:07 | Receipt scrolls: rate used, both addresses, transaction (callout: ON-CHAIN SETTLEMENT). | 07 · "A receipt your accountant accepts." | "Both sides get a receipt with the rate used and a link to the transaction." |
| 10 | 1:07–1:17 | Ada: "You've been paid" → "Stake what you just earned" → pool list (Garuda Pool, top rated) → Stake → "Your staking". | 08 · "Put your earnings to work." Chip: `sendNewStakerTransaction()` | "Then put the earnings to work: stake them with a top-rated pool in one tap." |
| 11 | 1:17–1:26 | Home again: the goal jumped to 69%. Tap Invoices tab (overdue badge), Clients view (per-client totals), Save tab (goal + staking). | 09 · "Your business, in four tabs." "Goal progress, clients and overdue invoices at a glance. CSV export for your accountant." | "Home, Invoices, Save and Withdraw: everything about getting paid in one place." |
| 12 | 1:26–1:36 | "Built on the Nimiq Pay API": six API cards. Then the end card: logo, tagline, nimbill.mblob.me, "Try it: pay the sample invoice for about $0.05", competition line. | — | "NimBill. Wallet to wallet. Try the sample invoice for about five cents." |

## API cards in scene 12

`nimiq.sign()` · `sendBasicTransactionWithData()` · `window.ethereum` (USDT on Polygon) · `sendNewStakerTransaction()` · `getBalance()` · `getHostFiat()`

## How the footage is made

- Every app screen is the real NimBill UI (commit `2d56fc6`, with the earnings chart, goals, tab bar and saved clients), captured from the local dev server at phone size in headless Chrome.
- Sign-in uses a throwaway test key, verified by the real server code (the same trick as `scripts/api-smoke.mjs`). Profile, saved clients, the November goal and the three real invoices are created through the real API.
- Rates, quotes and the staking pool list are live (the pool list was downloaded once because the validators API was too slow on this connection).
- **Simulated, and labelled in the video ("DEMO RECORDING · SAMPLE HISTORY · WALLET AND ON-CHAIN STEPS SIMULATED"):**
  - a year of sample past payments on the home chart, invoice list and clients view (the test merchant is brand new);
  - the wallet confirmations and the "paid" result: a desktop browser has no Nimiq Pay wallet and no real NIM moved, so the receipt shows a placeholder transaction hash;
  - the staking result.
- To show a real payment instead: pay the sample invoice on your phone in Nimiq Pay, screen-record it, and swap that recording into scenes 7–9.

## Files

- `demo/nimbill-demo.mp4`: final video with music (49 MB)
- `demo/nimbill-demo-silent.mp4`: same video without sound, for recording a voiceover over it
- Capture and render scripts: `../demo-video/` (outside the repo). With the dev server running: `node capture.mjs http://localhost:3000`, then `node render.mjs render` (or `node render.mjs serve` for a live preview). Change on-screen text in `film.js` (`COPY` and `CAPS`).

The MP4s are about 95 MB together; add `demo/*.mp4` to `.gitignore` if you don't want them in the repo, and upload the video to YouTube or the submission form instead.
