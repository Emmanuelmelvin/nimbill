import "server-only";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { decodeData, nimiq, sameNimAddress, type NimTx } from "./clients";
import { LUNA_PER_NIM } from "./currencies";
import { getDb, schema } from "./db";
import type { Transfer } from "./db/schema";
import { Errors } from "./errors";
import { newId } from "./invoices";
import { lookupTag } from "./merchant-tags";
import { getRate } from "./rates";
import { formatTag } from "./tags";

const HOUR = 3_600_000;
/** Pending transfers older than this were most likely never sent, and are no longer listed. */
const PENDING_SHOWN_MS = 24 * HOUR;
/** Most transfers one person may start in an hour (each one is a database row a stranger can't see). */
const MAX_STARTED_PER_HOUR = 30;

/** The data attached to the NIM transaction. Max 64 bytes; invoices use "NimBill <id>". */
export const transferMemo = (id: string) => `NimBill T ${id}`;

/**
 * Start sending money to a tag: work out the NIM amount and record the transfer as pending.
 * The browser then asks the wallet to send it, and calls verifyTransfer with the hash.
 */
export async function createTransfer(
  fromAddress: string,
  input: { to: string; amount: number; currency: string; note?: string | null },
): Promise<Transfer> {
  const owner = await lookupTag(input.to);
  if (!owner) throw Errors.notFound("No one has that tag. Check the spelling.");
  if (sameNimAddress(owner.address, fromAddress)) throw Errors.badRequest("That's your own tag. Pick someone else to send to.");

  const db = await getDb();
  const recent = await db
    .select({ id: schema.transfers.id })
    .from(schema.transfers)
    .where(and(eq(schema.transfers.fromAddress, fromAddress), gt(schema.transfers.createdAt, new Date(Date.now() - HOUR))));
  if (recent.length >= MAX_STARTED_PER_HOUR)
    throw Errors.rateLimited("You've started a lot of transfers in the last hour. Try again later.");

  const [me] = await db.select().from(schema.merchants).where(eq(schema.merchants.address, fromAddress));

  const rate = input.currency === "NIM" ? 1 : await getRate("NIM", input.currency);
  // Round up to 0.01 NIM in fiat, so the recipient gets at least the amount typed.
  const step = LUNA_PER_NIM / 100;
  const luna =
    input.currency === "NIM"
      ? Math.round(input.amount * LUNA_PER_NIM)
      : Math.max(step, Math.ceil(((input.amount / rate) * LUNA_PER_NIM) / step) * step);
  if (luna < 1) throw Errors.validation("The amount is too small to send.");

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
      amount: String(luna),
      currency: input.currency,
      fiatAmount: input.amount.toFixed(input.currency === "NIM" ? 5 : 2),
      rate: String(rate),
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

function txMatches(t: Transfer, tx: NimTx): boolean {
  return (
    tx.executionResult &&
    sameNimAddress(tx.to, t.toAddress) &&
    decodeData(tx.recipientData).trim() === transferMemo(t.id) &&
    BigInt(tx.value) >= BigInt(t.amount) &&
    // Not a transaction from before this transfer existed.
    tx.timestamp >= t.createdAt.getTime() - 60_000
  );
}

async function markConfirmed(t: Transfer, tx: NimTx): Promise<Transfer | null> {
  const db = await getDb();
  try {
    const [updated] = await db
      .update(schema.transfers)
      .set({ status: "confirmed", txHash: tx.hash.toLowerCase(), confirmedAt: new Date(tx.timestamp) })
      .where(and(eq(schema.transfers.id, t.id), eq(schema.transfers.status, "pending"), isNull(schema.transfers.txHash)))
      .returning();
    return updated ?? (await getTransfer(t.id));
  } catch {
    return null; // unique(tx_hash): this transaction already confirmed another transfer
  }
}

export type TransferVerifyResult =
  { status: "confirmed"; transfer: Transfer } | { status: "pending"; message: string } | { status: "rejected"; message: string };

/** Check the transaction the sender's wallet returned. */
export async function verifyTransfer(t: Transfer, txHash: string): Promise<TransferVerifyResult> {
  if (t.status === "confirmed") return { status: "confirmed", transfer: t };
  if (!/^[0-9a-f]{64}$/i.test(txHash)) return { status: "rejected", message: "Invalid transaction hash." };
  const tx = await nimiq.getTransaction(txHash.toLowerCase());
  if (!tx) return { status: "pending", message: "Waiting for the transaction to be included in a block…" };
  if (!tx.executionResult) return { status: "rejected", message: "The transaction failed on-chain." };
  if (!txMatches(t, tx)) return { status: "rejected", message: "This transaction doesn't match the transfer." };
  const updated = await markConfirmed(t, tx);
  if (updated?.status === "confirmed") return { status: "confirmed", transfer: updated };
  return { status: "rejected", message: "This transaction was already used." };
}

/**
 * Find transfers the sender's wallet never returned a hash for (the app was closed, or the
 * wallet couldn't say whether it was sent), by looking at the recipients' recent transactions.
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
    .limit(20);
  const recipients = [...new Set(pending.map((t) => t.toAddress))].slice(0, 5);
  for (const to of recipients) {
    let txs: NimTx[];
    try {
      txs = await nimiq.getTransactionsByAddress(to, 100);
    } catch {
      continue; // RPC hiccup: the next visit tries again
    }
    for (const t of pending.filter((p) => p.toAddress === to)) {
      const tx = txs.find((x) => txMatches(t, x));
      if (tx) await markConfirmed(t, tx);
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
