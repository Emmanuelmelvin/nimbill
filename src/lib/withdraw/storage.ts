import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { GetSwapResponse, StoredSwap, SwapStorage, WalletStorage } from "@lendasat/lendaswap-sdk-pure";
import { getDb, schema } from "../db";
import { env } from "../env";
import { Errors } from "../errors";

// Where the Lendaswap SDK keeps its state: in NimBill's own Postgres, so the web app (Vercel) and
// the worker (Fly) share one copy and neither needs a disk.
//
//   wallet  the recovery phrase (WITHDRAW_MNEMONIC, never stored) and the next key index. Every
//           swap gets its own keys, derived from the phrase at that index.
//   swaps   one record per swap, including its secret. Encrypted (AES-256-GCM) with a key derived
//           from the recovery phrase, so a database leak alone can't claim anything.

const WALLET_ID = "nimbill";

export function mnemonic(): string {
  if (!env.WITHDRAW_MNEMONIC) throw Errors.config("WITHDRAW_MNEMONIC must be set for live withdrawals.");
  return env.WITHDRAW_MNEMONIC;
}

const key = () => createHash("sha256").update(`nimbill/withdraw/storage/v1:${mnemonic()}`).digest();

// StoredSwap may carry bigints; JSON can't, so they travel as {"$bigint":"123"}.
const encode = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? { $bigint: x.toString() } : x));
const decode = (s: string) =>
  JSON.parse(s, (_k, x) => (x && typeof x === "object" && typeof x.$bigint === "string" ? BigInt(x.$bigint) : x));

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

function decrypt(enc: string): string {
  const [iv, tag, data] = enc.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

export class PgWalletStorage implements WalletStorage {
  async getMnemonic() {
    return mnemonic();
  }
  async setMnemonic(m: string) {
    // The phrase comes from the environment; the SDK must never replace it with a new one.
    if (m !== mnemonic()) throw Errors.config("Refusing to replace WITHDRAW_MNEMONIC with another recovery phrase.");
  }
  async getKeyIndex() {
    const db = await getDb();
    const [row] = await db.select().from(schema.withdrawWallet).where(eq(schema.withdrawWallet.id, WALLET_ID));
    return row?.keyIndex ?? 0;
  }
  async setKeyIndex(index: number) {
    const db = await getDb();
    await db
      .insert(schema.withdrawWallet)
      .values({ id: WALLET_ID, keyIndex: index })
      .onConflictDoUpdate({ target: schema.withdrawWallet.id, set: { keyIndex: index } });
  }
  /**
   * Hands out the next unused index and moves the counter on, in one atomic statement, so two
   * servers creating swaps at once never share keys. Like the SDK's own storages, it returns the
   * index to use (the value BEFORE the increment).
   */
  async incrementKeyIndex() {
    const db = await getDb();
    const [row] = await db
      .insert(schema.withdrawWallet)
      .values({ id: WALLET_ID, keyIndex: 1 })
      .onConflictDoUpdate({ target: schema.withdrawWallet.id, set: { keyIndex: sql`${schema.withdrawWallet.keyIndex} + 1` } })
      .returning();
    return row.keyIndex - 1;
  }
  async clear() {
    throw Errors.config("Refusing to clear the withdrawal wallet.");
  }
}

export class PgSwapStorage implements SwapStorage {
  async get(swapId: string): Promise<StoredSwap | null> {
    const db = await getDb();
    const [row] = await db.select().from(schema.withdrawSwaps).where(eq(schema.withdrawSwaps.swapId, swapId));
    return row ? (decode(decrypt(row.dataEnc)) as StoredSwap) : null;
  }
  async store(swap: StoredSwap): Promise<void> {
    const db = await getDb();
    const dataEnc = encrypt(encode(swap));
    await db
      .insert(schema.withdrawSwaps)
      .values({ swapId: swap.swapId, dataEnc })
      .onConflictDoUpdate({ target: schema.withdrawSwaps.swapId, set: { dataEnc, updatedAt: new Date() } });
  }
  async update(swapId: string, response: GetSwapResponse): Promise<void> {
    const swap = await this.get(swapId);
    if (swap) await this.store({ ...swap, response, updatedAt: Date.now() });
  }
  async delete(): Promise<void> {
    // Kept for good: a swap's secret is what proves and recovers it.
  }
  async list(): Promise<string[]> {
    const db = await getDb();
    return (await db.select({ id: schema.withdrawSwaps.swapId }).from(schema.withdrawSwaps)).map((r) => r.id);
  }
  async getAll(): Promise<StoredSwap[]> {
    const db = await getDb();
    return (await db.select().from(schema.withdrawSwaps)).map((r) => decode(decrypt(r.dataEnc)) as StoredSwap);
  }
  async clear(): Promise<void> {
    throw Errors.config("Refusing to clear withdrawal swaps.");
  }
}
