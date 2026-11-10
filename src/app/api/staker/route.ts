import { getSessionAddress } from "@/lib/auth";
import { fail, handle, json } from "@/lib/api";
import { getNimStaker } from "@/lib/chain";

// Is the signed-in merchant already staking? Decides between "new staker" and "add stake".
export const GET = handle(async () => {
  const address = await getSessionAddress();
  if (!address) return fail("Please sign in first.", 401);
  return json({ staker: await getNimStaker(address) });
});
