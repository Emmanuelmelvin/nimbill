import "server-only";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { getAddress } from "viem";
import { decodeData, nimiq, polygon, sameNimAddress, type NimTx, type UsdtTransfer } from "./clients";
import { LUNA_PER_NIM, USDT_DECIMALS } from "./currencies";
import { getDb, schema } from "./db";
import type { Transfer } from "./db/schema";
import { Errors } from "./errors";
import { newId } from "./invoices";
import { lookupTag } from "./merchant-tags";
import { enforceLimit } from "./rate-limit";
import { getRate } from "./rates";
import { formatTag } from "./tags";
import { CLOCK_SKEW_MS, PRICE_LOCK_GRACE_MS, PRICE_LOCK_MS, txHashUsed, uniqueUsdtAmount } from "./usdt-amounts";

const HOUR = 3_600_000;
/** Pending transfers older than this were most likely never sent, and are no longer listed. */
const PENDING_SHOWN_MS = 24 * HOUR;
/** Most transfers one person may start in an hour (each one is a database row a stranger can't see). */
const MAX_STARTED_PER_HOUR = 30;
/** Most pending USDT transfers searched on Polygon per visit (each is a log query). */
const MAX_USDT_RECONCILED = 10;

export type TransferAsset = "NIM" | "USDT";
const UNIT: Record<TransferAsset, number> = { NIM: LUNA_PER_NIM, USDT: 10 ** USDT_DECIMALS };

/** The data attached to the NIM transaction. Max 64 bytes; invoices use "NimBill <id>". */
export const transferMemo = (id: string) => `NimBill T ${id}`;

/**
 * Start sending money to a tag: work out the coin amount and record the transfer as pending.
 * The browser then asks the wallet to send it, and calls verifyTransfer with the hash.
 */
export async function createTransfer(
  fromAddress: string,
  input: { to: string; asset?: TransferAsset; amount: number; currency: string; fromEvmAddress?: string; note?: string | null },
): Promise<Transfer> {
  const asset = input.asset ?? "NIM";
  const owner = await lookupTag(input.to);
  if (!owner) throw Errors.notFound("No one has that tag. Check the spelling.");
  if (sameNimAddress(owner.address, fromAddress)) throw Errors.badRequest("That's your own tag. Pick someone else to send to.");

  const db = await getDb();
  const recent = await db
    .select({ createdAt: schema.transfers.createdAt })
    .from(schema.transfers)
    .where(and(eq(schema.transfers.fromAddress, fromAddress), gt(schema.transfers.createdAt, new Date(Date.now() - HOUR))));
  enforceLimit({
    used: recent.length,
    limit: MAX_STARTED_PER_HOUR,
    resetAt: Math.min(Date.now(), ...recent.map((r) => r.createdAt.getTime())) + HOUR,
    message: "You've started a lot of transfers in the last hour. Try again later.",
  });

  const [[me], [recipient]] = await Promise.all([
    db.select().from(schema.merchants).where(eq(schema.merchants.address, fromAddress)),
    db.select({ evmAddress: schema.merchants.evmAddress }).from(schema.merchants).where(eq(schema.merchants.address, owner.address)),
  ]);

  let toEvmAddress: string | null = null;
  let fromEvmAddress: string | null = null;
  if (asset === "USDT") {
    if (!recipient?.evmAddress) throw Errors.badRequest(`${formatTag(owner.tag)} doesn't accept USDT yet. Send NIM instead.`);
    if (!input.fromEvmAddress) throw Errors.validation("Sending USDT needs your wallet's Polygon address.");
    toEvmAddress = getAddress(recipient.evmAddress);
    fromEvmAddress = getAddress(input.fromEvmAddress);
    if (toEvmAddress === fromEvmAddress) throw Errors.badRequest("That Polygon wallet is your own. Pick someone else to send to.");
  }

  // Typed in the coin itself: no rate. Otherwise the live price of the coin in that currency.
  const rate = input.currency === asset ? 1 : await getRate(asset, input.currency);
  const unit = UNIT[asset];
  const step = unit / 100;
  let units: bigint;
  if (input.currency === "NIM") units = BigInt(Math.round(input.amount * unit));
  else {
    // Round up to 0.01 of the coin, so the recipient gets at least the amount typed.
    units = BigInt(Math.max(step, Math.ceil(((input.amount / rate) * unit) / step) * step));
  }
  if (units < BigInt(1)) throw Errors.validation("The amount is too small to send.");
  // A USDT transfer can't carry a memo: the exact amount is what ties the transaction to this transfer.
  if (asset === "USDT") units = await uniqueUsdtAmount(toEvmAddress!, units);

  const [t] = await db
    .insert(schema.transfers)
    .values({
      id: newId(),
      fromAddress,
      fromName: me?.name ?? "",
      fromTag: me?.tag ?? null,
      toAddress: owner.address,
      toName: owner.name,
      toTag: owner.tag,
      asset,
      amount: units.toString(),
      currency: input.currency,
      fiatAmount: input.amount.toFixed(input.currency === "NIM" ? 5 : input.currency === "USDT" ? 6 : 2),
      rate: String(rate),
      toEvmAddress,
      fromEvmAddress,
      note: input.note?.trim() || null,
    })
    .returning();
  return t;
}

export async function getTransfer(id: string): Promise<Transfer | null> {
  const db = await getDb();
  const [t] = await db.select().from(schema.transfers).where(eq(schema.transfers.id, id));
  return t ?? null;
}

function nimTxMatches(t: Transfer, tx: NimTx): boolean {
  return (
    t.asset === "NIM" &&
    tx.executionResult &&
    sameNimAddress(tx.to, t.toAddress) &&
    decodeData(tx.recipientData).trim() === transferMemo(t.id) &&
    BigInt(tx.value) >= BigInt(t.amount) &&
    // Not a transaction from before this transfer existed.
    tx.timestamp >= t.createdAt.getTime() - CLOCK_SKEW_MS
  );
}

/**
 * A USDT transfer has no memo, so it must match on everything else: from the sender's wallet, to
 * the recipient's wallet as it was when the transfer started, the exact (unique) amount, and sent
 * while the price was locked.
 */
function usdtMatches(t: Transfer, x: UsdtTransfer): boolean {
  if (t.asset !== "USDT" || !t.toEvmAddress || !t.fromEvmAddress) return false;
  const start = t.createdAt.getTime();
  return (
    getAddress(x.to) === getAddress(t.toEvmAddress) &&
    getAddress(x.from) === getAddress(t.fromEvmAddress) &&
    x.value === BigInt(t.amount) &&
    x.timestamp >= start - CLOCK_SKEW_MS &&
    x.timestamp <= start + PRICE_LOCK_MS + PRICE_LOCK_GRACE_MS
  );
}

async function markConfirmed(t: Transfer, txHash: string, at: number): Promise<Transfer | null> {
  // Already an invoice payment (or another transfer): it can't count for this transfer too.
  if (await txHashUsed(txHash)) return getTransfer(t.id);
  const db = await getDb();
  try {
    const [updated] = await db
      .update(schema.transfers)
      .set({ status: "confirmed", txHash: txHash.toLowerCase(), confirmedAt: new Date(at) })
      .where(and(eq(schema.transfers.id, t.id), eq(schema.transfers.status, "pending"), isNull(schema.transfers.txHash)))
      .returning();
    return updated ?? (await getTransfer(t.id));
  } catch {
    return null; // unique(tx_hash): this transaction already confirmed another transfer
  }
}

export type TransferVerifyResult =
  { status: "confirmed"; transfer: Transfer } | { status: "pending"; message: string } | { status: "rejected"; message: string };

const ALREADY_USED: TransferVerifyResult = { status: "rejected", message: "This transaction was already used." };

/** Check the transaction the sender's wallet returned. */
export async function verifyTransfer(t: Transfer, txHash: string): Promise<TransferVerifyResult> {
  if (t.status === "confirmed") return { status: "confirmed", transfer: t };
  return t.asset === "USDT" ? verifyUsdt(t, txHash) : verifyNim(t, txHash);
}

async function verifyNim(t: Transfer, txHash: string): Promise<TransferVerifyResult> {
  if (!/^[0-9a-f]{64}$/i.test(txHash)) return { status: "rejected", message: "Invalid transaction hash." };
  const tx = await nimiq.getTransaction(txHash.toLowerCase());
  if (!tx) return { status: "pending", message: "Waiting for the transaction to be included in a block…" };
  if (!tx.executionResult) return { status: "rejected", message: "The transaction failed on-chain." };
  if (!nimTxMatches(t, tx)) return { status: "rejected", message: "This transaction doesn't match the transfer." };
  const updated = await markConfirmed(t, tx.hash, tx.timestamp);
  return updated?.status === "confirmed" ? { status: "confirmed", transfer: updated } : ALREADY_USED;
}

async function verifyUsdt(t: Transfer, txHash: string): Promise<TransferVerifyResult> {
  if (!/^0x[0-9a-f]{64}$/i.test(txHash)) return { status: "rejected", message: "Invalid transaction hash." };
  const tx = await polygon.getUsdtTransfers(txHash.toLowerCase());
  if (tx.status === "pending") return { status: "pending", message: "Waiting for Polygon to include the transaction…" };
  if (tx.status === "reverted") return { status: "rejected", message: "This USDT transaction failed on-chain." };
  const x = tx.transfers.find((x) => usdtMatches(t, x));
  if (!x) return { status: "rejected", message: "This transaction doesn't match the transfer (wallets, exact amount or time)." };
  if (!x.confirmed) return { status: "pending", message: "Confirming on Polygon…" };
  const updated = await markConfirmed(t, txHash, x.timestamp);
  return updated?.status === "confirmed" ? { status: "confirmed", transfer: updated } : ALREADY_USED;
}

/**
 * Find transfers the sender's wallet never returned a hash for (the app was closed, or the
 * wallet couldn't say whether it was sent). NIM: look at the recipients' recent transactions
 * for the memo. USDT: look on Polygon for transfers into the recipient's wallet while the price was locked.
 */
export async function reconcileTransfers(fromAddress: string): Promise<void> {
  const db = await getDb();
  const pending = await db
    .select()
    .from(schema.transfers)
    .where(
      and(
        eq(schema.transfers.fromAddress, fromAddress),
        eq(schema.transfers.status, "pending"),
        gt(schema.transfers.createdAt, new Date(Date.now() - PENDING_SHOWN_MS)),
      ),
    )
    .orderBy(desc(schema.transfers.createdAt))
    .limit(20);
  await reconcileNim(pending.filter((t) => t.asset === "NIM"));
  await reconcileUsdt(pending.filter((t) => t.asset === "USDT").slice(0, MAX_USDT_RECONCILED));
}

async function reconcileNim(pending: Transfer[]) {
  const recipients = [...new Set(pending.map((t) => t.toAddress))].slice(0, 5);
  for (const to of recipients) {
    let txs: NimTx[];
    try {
      txs = await nimiq.getTransactionsByAddress(to, 100);
    } catch {
      continue; // RPC hiccup: the next visit tries again
    }
    for (const t of pending.filter((p) => p.toAddress === to)) {
      const tx = txs.find((x) => nimTxMatches(t, x));
      if (tx) await markConfirmed(t, tx.hash, tx.timestamp);
    }
  }
}

async function reconcileUsdt(pending: Transfer[]) {
  const now = Date.now();
  const byWallet = new Map<string, Transfer[]>();
  for (const t of pending) {
    if (!t.toEvmAddress) continue;
    const key = t.toEvmAddress.toLowerCase();
    byWallet.set(key, [...(byWallet.get(key) ?? []), t]);
  }
  for (const [wallet, ts] of byWallet) {
    const windows = ts.map((t) => ({
      fromMs: t.createdAt.getTime() - CLOCK_SKEW_MS,
      toMs: Math.min(now, t.createdAt.getTime() + PRICE_LOCK_MS + PRICE_LOCK_GRACE_MS),
    }));
    let found: UsdtTransfer[];
    try {
      found = await polygon.getUsdtTransfersTo(wallet, windows);
    } catch {
      continue; // RPC hiccup: the next visit tries again
    }
    for (const t of ts) {
      // Picked up once it has enough confirmations.
      const x = found.find((x) => x.confirmed && usdtMatches(t, x));
      if (x) await markConfirmed(t, x.hash, x.timestamp);
    }
  }
}

/** Transfers you sent (confirmed, or pending from the last day) and confirmed ones sent to you, newest first. */
export async function listTransfers(address: string): Promise<Transfer[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.transfers)
    .where(
      or(
        and(
          eq(schema.transfers.fromAddress, address),
          or(eq(schema.transfers.status, "confirmed"), gt(schema.transfers.createdAt, new Date(Date.now() - PENDING_SHOWN_MS))),
        ),
        and(eq(schema.transfers.toAddress, address), eq(schema.transfers.status, "confirmed")),
      ),
    )
    .orderBy(desc(schema.transfers.createdAt))
    .limit(200);
}

/** A transfer as one side of it sees it. Addresses stay out: the tags and names say who it was. */
export function transferView(t: Transfer, me: string) {
  const sent = sameNimAddress(t.fromAddress, me);
  return {
    id: t.id,
    direction: sent ? ("sent" as const) : ("received" as const),
    counterparty: sent
      ? { name: t.toName, handle: formatTag(t.toTag) }
      : { name: t.fromName || "Someone", handle: t.fromTag ? formatTag(t.fromTag) : null },
    asset: t.asset,
    amount: t.amount,
    currency: t.currency,
    fiatAmount: t.fiatAmount,
    note: t.note,
    status: t.status,
    txHash: t.txHash,
    createdAt: t.createdAt.toISOString(),
    confirmedAt: t.confirmedAt?.toISOString() ?? null,
  };
}
export type TransferView = ReturnType<typeof transferView>;

/** What the sender's wallet must send for `t`. */
export function transferPayment(t: Transfer) {
  return t.asset === "USDT"
    ? { asset: "USDT" as const, recipient: t.toEvmAddress!, amount: t.amount, memo: null, rate: t.rate }
    : { asset: "NIM" as const, recipient: t.toAddress, amount: t.amount, memo: transferMemo(t.id), rate: t.rate };
}
