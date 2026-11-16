import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { nimiq } from "@/lib/clients";

// The signed-in user's NIM balance, read from the Nimiq network by the server. Nimiq Pay's own
// getBalance() can answer 0 (e.g. before its light client has synced), so the Withdraw screen
// asks here instead.
export const GET = handle(async () => {
  const address = await requireSessionAddress();
  return json({ nim: await nimiq.getBalance(address) }); // Luna
});
