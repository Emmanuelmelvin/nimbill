import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { nimiq } from "@/lib/clients";

// Is the signed-in merchant already staking? Decides between "new staker" and "add stake".
export const GET = handle(async () => {
  const address = await requireSessionAddress();
  return json({ staker: await nimiq.getStaker(address) });
});
