import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Merchant } from "./db/schema";
import { Errors } from "./errors";
import { MAX_IMAGE_BYTES } from "./schemas";
import { avatarUrl } from "./tags";

/** Set or replace the merchant's photo. `dataUrl` has already passed ProductImageBody. */
export async function setAvatar(address: string, dataUrl: string): Promise<Merchant> {
  const [, mime, data] = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/)!;
  if (Buffer.byteLength(data, "base64") > MAX_IMAGE_BYTES) throw Errors.validation("That photo is too large. Try a smaller one.");
  const db = await getDb();
  const [m] = await db.select().from(schema.merchants).where(eq(schema.merchants.address, address));
  if (!m) throw Errors.notFound("Account not found.");
  await db
    .insert(schema.merchantAvatars)
    .values({ address, mime, data })
    .onConflictDoUpdate({ target: schema.merchantAvatars.address, set: { mime, data } });
  const [updated] = await db
    .update(schema.merchants)
    .set({ avatarVersion: (m.avatarVersion ?? 0) + 1 })
    .where(eq(schema.merchants.address, address))
    .returning();
  return updated;
}

export async function removeAvatar(address: string): Promise<Merchant> {
  const db = await getDb();
  await db.delete(schema.merchantAvatars).where(eq(schema.merchantAvatars.address, address));
  const [updated] = await db.update(schema.merchants).set({ avatarVersion: null }).where(eq(schema.merchants.address, address)).returning();
  return updated;
}

/** The photo of whoever has this tag, or null. */
export async function getAvatarByTag(tag: string): Promise<{ mime: string; bytes: Buffer } | null> {
  const db = await getDb();
  const [row] = await db
    .select({ mime: schema.merchantAvatars.mime, data: schema.merchantAvatars.data })
    .from(schema.merchants)
    .innerJoin(schema.merchantAvatars, eq(schema.merchantAvatars.address, schema.merchants.address))
    .where(eq(schema.merchants.tag, tag));
  return row ? { mime: row.mime, bytes: Buffer.from(row.data, "base64") } : null;
}

/** Where a merchant's photo is served, or null when they have none (or no tag to serve it at). */
export const merchantAvatarUrl = (m: Pick<Merchant, "tag" | "avatarVersion">) =>
  m.tag && m.avatarVersion ? avatarUrl(m.tag, m.avatarVersion) : null;
