import "server-only";
import { getSessionAddress } from "../auth";
import { env } from "../env";
import { Errors } from "../errors";
import { logger } from "../logger";
import { normalizeAddress } from "../nimiq-address";

// Crypto withdrawals stay hidden while they are tested on the live app: only the Nimiq addresses in
// WITHDRAW_TESTERS see them. Everyone else keeps today's Withdraw page. Checked on the server, on
// every withdraw route, so hiding the button is not the only thing in the way.

let cache: { raw: string | undefined; set: Set<string> } | undefined;

function testers(): Set<string> {
  const raw = env.WITHDRAW_TESTERS;
  if (cache && cache.raw === raw) return cache.set;
  const set = new Set<string>();
  for (const entry of (raw ?? "").split(",")) {
    if (!entry.trim()) continue;
    const address = normalizeAddress(entry);
    // A typo must not take the app down while judges may be using it: skip it, loudly.
    if (address) set.add(address);
    else logger.warn("WITHDRAW_TESTERS has an entry that is not a Nimiq address; it is ignored", { entry: entry.trim() });
  }
  cache = { raw, set };
  return set;
}

/** Whether this Nimiq address may use crypto withdrawals yet. */
export function canWithdrawCrypto(address: string | null | undefined): boolean {
  if (!address) return false;
  const normalized = normalizeAddress(address);
  return !!normalized && testers().has(normalized);
}

/** The signed-in address, if it may use crypto withdrawals. Otherwise throws (401 / 404). */
export async function requireWithdrawAccess(): Promise<string> {
  const address = await getSessionAddress();
  if (!address) throw Errors.unauthorized();
  // 404, not 403: to everyone else the feature does not exist yet.
  if (!canWithdrawCrypto(address)) throw Errors.notFound();
  return address;
}
