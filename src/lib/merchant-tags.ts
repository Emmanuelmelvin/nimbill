import "server-only";
import { and, eq, gt, ne } from "drizzle-orm";
import { getDb, schema } from "./db";
import { Errors } from "./errors";
import { TAG_CHANGE_COOLDOWN_DAYS, TAG_HOLD_DAYS, normalizeTag, tagProblem } from "./tags";

const DAY = 86_400_000;
const TAKEN = "That tag is taken. Try another.";

/** Why `address` can't use this tag, or null if it can. The tag is normalized first. */
export async function tagUnavailableReason(rawTag: string, address: string | null): Promise<string | null> {
  const tag = normalizeTag(rawTag);
  const problem = tagProblem(tag);
  if (problem) return problem;
  const db = await getDb();
  const [owner] = await db.select({ address: schema.merchants.address }).from(schema.merchants).where(eq(schema.merchants.tag, tag));
  if (owner && owner.address !== address) return TAKEN;
  const [held] = await db
    .select({ address: schema.retiredTags.address })
    .from(schema.retiredTags)
    .where(and(eq(schema.retiredTags.tag, tag), gt(schema.retiredTags.retiredAt, new Date(Date.now() - TAG_HOLD_DAYS * DAY))));
  if (held && held.address !== address) return TAKEN;
  return null;
}

/**
 * Give the merchant this tag. The first change after claiming one is free; after that a tag can
 * change once every TAG_CHANGE_COOLDOWN_DAYS. The old tag is held for its owner (see retired_tags).
 */
export async function setMerchantTag(address: string, rawTag: string): Promise<void> {
  const tag = normalizeTag(rawTag);
  const db = await getDb();
  const [merchant] = await db.select().from(schema.merchants).where(eq(schema.merchants.address, address));
  if (!merchant) throw Errors.notFound("Account not found.");
  if (merchant.tag === tag) return;

  if (merchant.tag && merchant.tagChangedAt) {
    const next = merchant.tagChangedAt.getTime() + TAG_CHANGE_COOLDOWN_DAYS * DAY;
    if (next > Date.now()) {
      const when = new Date(next).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      throw Errors.badRequest(`You changed your tag recently. You can change it again on ${when}.`);
    }
  }

  const reason = await tagUnavailableReason(tag, address);
  if (reason) throw Errors.conflict(reason);

  try {
    await db
      .update(schema.merchants)
      // Claiming a first tag doesn't start the waiting period, so a typo can be fixed straight away.
      .set({ tag, tagChangedAt: merchant.tag ? new Date() : null })
      .where(eq(schema.merchants.address, address));
  } catch (e) {
    // Someone claimed it between the check and the update.
    if (/23505|duplicate key/i.test(String((e as { cause?: unknown }).cause ?? e))) throw Errors.conflict(TAKEN);
    throw e;
  }

  if (merchant.tag) {
    await db
      .insert(schema.retiredTags)
      .values({ tag: merchant.tag, address })
      .onConflictDoUpdate({ target: schema.retiredTags.tag, set: { address, retiredAt: new Date() } });
  }
  // Taking back one of your own old tags: it is no longer on hold.
  await db.delete(schema.retiredTags).where(and(eq(schema.retiredTags.tag, tag), eq(schema.retiredTags.address, address)));
}

/** What anyone may learn about a tag's owner: enough to check who they are paying. */
export async function lookupTag(rawTag: string) {
  const tag = normalizeTag(rawTag);
  if (tagProblem(tag)) return null;
  const db = await getDb();
  const [m] = await db
    .select({
      tag: schema.merchants.tag,
      name: schema.merchants.name,
      address: schema.merchants.address,
      evmAddress: schema.merchants.evmAddress,
    })
    .from(schema.merchants)
    .where(and(eq(schema.merchants.tag, tag), ne(schema.merchants.name, "")));
  if (!m?.tag) return null;
  return { tag: m.tag, name: m.name, address: m.address, acceptsUsdt: !!m.evmAddress };
}
export type TagOwner = NonNullable<Awaited<ReturnType<typeof lookupTag>>>;
