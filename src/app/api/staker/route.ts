import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { nimiq } from "@/lib/clients";
import type { StakingPosition } from "@/lib/staking";

const BLOCK_MS = 1000; // Albatross produces one block per second

// The signed-in merchant's staking position: what is staked, what is being unstaked and when
// it unlocks, and what can be moved back to the wallet. null when the address is not a staker.
export const GET = handle(async () => {
  const address = await requireSessionAddress();
  const s = await nimiq.getStaker(address);
  if (!s) return json({ staker: null });

  let unlocked = s.inactiveBalance > 0;
  let unlocksAt: string | null = null;
  if (s.inactiveBalance > 0 && s.inactiveFrom != null) {
    const [head, release] = await Promise.all([nimiq.getBlockNumber(), nimiq.getBlockAfterReportingWindow(s.inactiveFrom)]);
    unlocked = head >= release;
    if (!unlocked) unlocksAt = new Date(Date.now() + (release - head) * BLOCK_MS).toISOString();
  }

  const staker: StakingPosition = {
    delegation: s.delegation,
    balance: s.balance,
    inactiveBalance: s.inactiveBalance,
    retiredBalance: s.retiredBalance,
    unlocked,
    unlocksAt,
  };
  return json({ staker });
});
