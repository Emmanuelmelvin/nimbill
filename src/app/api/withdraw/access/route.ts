import { handle, json } from "@/lib/api";
import { getSessionAddress } from "@/lib/auth";
import { canWithdrawCrypto } from "@/lib/withdraw/access";

// Which withdrawals the signed-in user can see. Crypto withdrawals are only on for the addresses in
// WITHDRAW_TESTERS while they are tested; everyone else gets `crypto: false` and today's page.
// The tester list itself is never sent.
export const GET = handle(async () => {
  const address = await getSessionAddress();
  return json({ crypto: canWithdrawCrypto(address) });
});
