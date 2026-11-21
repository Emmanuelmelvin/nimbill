// Makes a new recovery phrase for WITHDRAW_MNEMONIC (live withdrawals, see src/lib/env.ts).
//
//   bun run withdraw:new-phrase
//
// Run it once, on your own computer. Then:
//   1. Write the phrase down and keep it offline. Anyone with it can claim in-progress withdrawals;
//      without it, a withdrawal in progress can't be finished.
//   2. Set the SAME value as WITHDRAW_MNEMONIC on the web app (Vercel) and the worker (Fly).
//   3. Never change it while a withdrawal is in progress.
// Nothing is saved or sent anywhere by this script.
import { Client, InMemorySwapStorage, InMemoryWalletStorage } from "@lendasat/lendaswap-sdk-pure";

const client = await Client.builder().withSignerStorage(new InMemoryWalletStorage()).withSwapStorage(new InMemorySwapStorage()).build();
console.log(client.getMnemonic());
