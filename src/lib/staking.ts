import { LUNA_PER_NIM } from "./currencies";

// Staking rules shared by the server (/api/staker) and the browser (StakeCard).
//
// A Nimiq staker has three balances:
//   active   -> earning rewards with the chosen pool
//   inactive -> being unstaked; locked until the waiting period ends
//   retired  -> out of staking for good; can be moved back to the wallet
// Unstaking is three transactions: set active stake (lower it), retire, remove.

/** Protocol minimum: what stays staked must be zero or at least this much. */
export const MIN_STAKE_LUNA = 100 * LUNA_PER_NIM;
export const MIN_STAKE_NIM = MIN_STAKE_LUNA / LUNA_PER_NIM;

/** All amounts in Luna. */
export type StakingPosition = {
  delegation: string;
  /** Active stake. */
  balance: number;
  inactiveBalance: number;
  retiredBalance: number;
  /** True when the waiting period for the inactive balance is over. */
  unlocked: boolean;
  /** Estimated end of the waiting period (ISO), or null when nothing is waiting. */
  unlocksAt: string | null;
};

/** NIM still locked in the waiting period. */
export function waitingLuna(p: StakingPosition): number {
  return p.unlocked ? 0 : p.inactiveBalance;
}

/** NIM that can be moved back to the wallet now. */
export function withdrawableLuna(p: StakingPosition): number {
  return p.retiredBalance + (p.unlocked ? p.inactiveBalance : 0);
}

/** Why this amount cannot be unstaked, or null when it can. */
export function unstakeProblem(p: StakingPosition, luna: number): string | null {
  if (!(luna > 0)) return "Enter an amount.";
  if (luna > p.balance) return "That's more than you have staked.";
  const left = p.balance - luna;
  if (left > 0 && left < MIN_STAKE_LUNA) return `Leave at least ${MIN_STAKE_NIM} NIM staked, or unstake everything.`;
  return null;
}

/** "in about 5 hours", for the end of the waiting period. */
export function untilText(iso: string, now = Date.now()): string {
  const min = Math.max(1, Math.round((Date.parse(iso) - now) / 60_000));
  if (min < 60) return `in about ${min} ${min === 1 ? "minute" : "minutes"}`;
  const h = Math.round(min / 60);
  return `in about ${h} ${h === 1 ? "hour" : "hours"}`;
}
