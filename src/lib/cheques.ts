import "server-only";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import type { z } from "zod";
import { merchantAvatarUrl } from "./avatars";
import {
  chequeNumber,
  combinePublicKeys,
  hashBasicTxContent,
  keyFromSeedBytes,
  serializeBasicTxContent,
  serverPartialSignTx,
  verifyRawBasicTx,
  type BasicTxFields,
} from "./cheque-crypto";
import { decodeData, nimiq, sameNimAddress, type NimTx } from "./clients";
import { LUNA_PER_NIM } from "./currencies";
import { getDb, schema } from "./db";
import type { Cheque } from "./db/schema";
import { env, isProd } from "./env";
import { Errors } from "./errors";
import { newId } from "./invoices";
import { lookupTag } from "./merchant-tags";
import { normalizeAddress } from "./nimiq-address";
import { getRate } from "./rates";
import type { ChequeClaimBody, NewChequeBody } from "./schemas";
import { formatTag } from "./tags";

const HOUR = 3_600_000;
/** Unfunded cheques older than a day were never paid in the wallet and are hidden from the list. */
const PENDING_SHOWN_MS = 24 * HOUR;
/** Most cheques one wallet can start in an hour. */
const MAX_STARTED_PER_HOUR = 30;

/** The data attached to the NIM funding transaction. Max 64 bytes. */
export const chequeMemo = (id: string) => `NimBill C ${id}`;

/** Deterministic server half of the 2-of-2 cheque key for `chequeId`. */
function serverChequeKey(chequeId: string) {
  if (isProd && !env.SESSION_SECRET) {
    throw Errors.config("SESSION_SECRET (32+ chars) must be set in production.");
  }
  const secretKey = utf8ToBytes(env.SESSION_SECRET || "nimbill-local-dev-cheque-key-v1");
  const seed = hmac(sha256, secretKey, utf8ToBytes(`cheque-server-key-v1:${chequeId}`));
  return keyFromSeedBytes("nimbill-cheque-server-scalar-v1:", seed);
}

/**
 * Create a cheque record before the writer funds it in their wallet.
 * The client sends only `linkPublicKey` (never the secret), and the server combines it with
 * its own deterministic public key for this cheque ID to form `chequeAddress`.
 */
export async function createCheque(
  writerAddress: string,
  input: z.output<typeof NewChequeBody>,
): Promise<{ cheque: Cheque; rate: number }> {
  const db = await getDb();
  const recent = await db
    .select({ id: schema.cheques.id })
    .from(schema.cheques)
    .where(and(eq(schema.cheques.writerAddress, writerAddress), gt(schema.cheques.createdAt, new Date(Date.now() - HOUR))));
  if (recent.length >= MAX_STARTED_PER_HOUR) {
    throw Errors.rateLimited("You've started a lot of cheques in the last hour. Try again later.");
  }

  let recipientTag: string | null = null;
  let recipientName: string | null = null;
  if (input.recipientTag) {
    const owner = await lookupTag(input.recipientTag);
    if (!owner) throw Errors.notFound("No one has that tag. Check the spelling.");
    if (sameNimAddress(owner.address, writerAddress)) {
      throw Errors.badRequest("That's your own tag. Pick someone else, or make it a free cheque.");
    }
    recipientTag = owner.tag;
    recipientName = owner.name;
  }

  const [me] = await db.select().from(schema.merchants).where(eq(schema.merchants.address, writerAddress));

  const rate = input.currency === "NIM" ? 1 : await getRate("NIM", input.currency);
  const step = LUNA_PER_NIM / 100;
  const luna =
    input.currency === "NIM"
      ? Math.round(input.amount * LUNA_PER_NIM)
      : Math.max(step, Math.ceil(((input.amount / rate) * LUNA_PER_NIM) / step) * step);
  if (luna < 1) throw Errors.validation("The amount is too small for a cheque.");

  const id = newId();
  const srv = serverChequeKey(id);
  const linkPub = input.linkPublicKey.toLowerCase();
  const combined = combinePublicKeys(linkPub, srv.publicKey);

  const [c] = await db
    .insert(schema.cheques)
    .values({
      id,
      writerAddress,
      writerName: me?.name || "Someone",
      writerTag: me?.tag ?? null,
      chequeAddress: combined.address,
      chequePublicKey: combined.publicKey,
      linkPublicKey: linkPub,
      recipientTag,
      recipientName,
      amount: String(luna),
      currency: input.currency,
      fiatAmount: input.amount.toFixed(input.currency === "NIM" ? 5 : 2),
      rate: String(rate),
      note: input.note?.trim() || null,
    })
    .returning();

  return { cheque: c, rate };
}

export async function getCheque(id: string): Promise<Cheque | null> {
  const db = await getDb();
  const [c] = await db.select().from(schema.cheques).where(eq(schema.cheques.id, id));
  return c ?? null;
}

function fundTxMatches(c: Cheque, tx: NimTx): boolean {
  return (
    tx.executionResult &&
    sameNimAddress(tx.to, c.chequeAddress) &&
    decodeData(tx.recipientData).trim() === chequeMemo(c.id) &&
    BigInt(tx.value) >= BigInt(c.amount) &&
    tx.timestamp >= c.createdAt.getTime() - 60_000
  );
}

async function markFunded(c: Cheque, tx: NimTx): Promise<Cheque | null> {
  const db = await getDb();
  try {
    const [updated] = await db
      .update(schema.cheques)
      .set({ status: "funded", fundTxHash: tx.hash.toLowerCase(), fundedAt: new Date(tx.timestamp) })
      .where(and(eq(schema.cheques.id, c.id), eq(schema.cheques.status, "pending"), isNull(schema.cheques.fundTxHash)))
      .returning();
    return updated ?? (await getCheque(c.id));
  } catch {
    return null;
  }
}

export type ChequeVerifyResult =
  | { status: "funded" | "cashed" | "cancelled"; cheque: Cheque }
  | { status: "pending"; message: string }
  | { status: "rejected"; message: string };

/** Verify the funding transaction sent from the writer's wallet to `chequeAddress`. */
export async function verifyChequeFunding(c: Cheque, txHash?: string): Promise<ChequeVerifyResult> {
  if (c.status === "funded" || c.status === "cashed" || c.status === "cancelled") {
    return { status: c.status, cheque: c };
  }
  if (txHash) {
    if (!/^[0-9a-f]{64}$/i.test(txHash)) return { status: "rejected", message: "Invalid transaction hash." };
    const tx = await nimiq.getTransaction(txHash.toLowerCase());
    if (!tx) return { status: "pending", message: "Waiting for the transaction to be included in a block…" };
    if (!tx.executionResult) return { status: "rejected", message: "The transaction failed on-chain." };
    if (!fundTxMatches(c, tx)) return { status: "rejected", message: "This transaction doesn't match the cheque." };
    const updated = await markFunded(c, tx);
    if (updated && updated.status !== "pending") return { status: updated.status, cheque: updated };
    return { status: "rejected", message: "This transaction was already used." };
  }

  const reconciled = await reconcileCheque(c);
  if (reconciled.status === "funded" || reconciled.status === "cashed" || reconciled.status === "cancelled") {
    return { status: reconciled.status, cheque: reconciled };
  }
  return { status: "pending", message: "Waiting for the funding transaction on the blockchain…" };
}

/** Check the cheque wallet's on-chain transactions to catch up with funding or settlement. */
export async function reconcileCheque(c: Cheque): Promise<Cheque> {
  if (c.status === "cashed" || c.status === "cancelled") return c;
  let txs: NimTx[];
  try {
    txs = await nimiq.getTransactionsByAddress(c.chequeAddress, 20);
  } catch {
    return c;
  }

  let current = c;
  if (current.status === "pending") {
    const fundTx = txs.find((tx) => fundTxMatches(current, tx));
    if (fundTx) {
      current = (await markFunded(current, fundTx)) ?? current;
    }
  }

  if (current.status === "funded") {
    const outTx = txs.find((tx) => tx.executionResult && sameNimAddress(tx.from, current.chequeAddress));
    if (outTx) {
      const isCancel = sameNimAddress(outTx.to, current.writerAddress);
      const db = await getDb();
      const [recipientMerchant] = await db.select().from(schema.merchants).where(eq(schema.merchants.address, outTx.to));
      const [updated] = await db
        .update(schema.cheques)
        .set({
          status: isCancel ? "cancelled" : "cashed",
          settleTxHash: outTx.hash.toLowerCase(),
          settledAt: new Date(outTx.timestamp),
          claimedByAddress: outTx.to,
          claimedByName: recipientMerchant?.name || current.claimedByName || (isCancel ? current.writerName : "Someone"),
          claimedByTag: recipientMerchant?.tag ?? current.claimedByTag ?? null,
        })
        .where(eq(schema.cheques.id, current.id))
        .returning();
      if (updated) current = updated;
    }
  }

  return current;
}

/** Reconcile recent pending or funded cheques written by `writerAddress`. */
export async function reconcileWriterCheques(writerAddress: string): Promise<void> {
  const db = await getDb();
  const active = await db
    .select()
    .from(schema.cheques)
    .where(
      and(
        eq(schema.cheques.writerAddress, writerAddress),
        or(
          and(eq(schema.cheques.status, "pending"), gt(schema.cheques.createdAt, new Date(Date.now() - PENDING_SHOWN_MS))),
          eq(schema.cheques.status, "funded"),
        ),
      ),
    )
    .limit(10);
  for (const c of active) {
    await reconcileCheque(c);
  }
}

export async function listCheques(writerAddress: string): Promise<Cheque[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.cheques)
    .where(
      and(
        eq(schema.cheques.writerAddress, writerAddress),
        or(
          eq(schema.cheques.status, "funded"),
          eq(schema.cheques.status, "cashed"),
          eq(schema.cheques.status, "cancelled"),
          gt(schema.cheques.createdAt, new Date(Date.now() - PENDING_SHOWN_MS)),
        ),
      ),
    )
    .orderBy(desc(schema.cheques.createdAt))
    .limit(100);
}

/** Validate that `recipientAddress` and `action` obey the cheque's rules before co-signing or broadcasting. */
async function validateClaimRules(
  c: Cheque,
  action: "cash" | "cancel",
  rawRecipientAddress: string,
  sessionAddress: string | null,
): Promise<{ recipient: string; recipientTagOwner: { tag: string; name: string; address: string } | null }> {
  if (c.status === "cashed") throw Errors.badRequest("This cheque has already been cashed.");
  if (c.status === "cancelled") throw Errors.badRequest("This cheque was cancelled by its writer.");
  if (c.status !== "funded") throw Errors.badRequest("This cheque hasn't been funded on the blockchain yet.");

  const recipient = normalizeAddress(rawRecipientAddress);
  if (!recipient) throw Errors.validation("Enter a valid Nimiq address (starting with NQ).");

  if (action === "cancel") {
    if (!sessionAddress || !sameNimAddress(sessionAddress, c.writerAddress)) {
      throw Errors.forbidden("Only the person who wrote this cheque can cancel it.");
    }
    if (!sameNimAddress(recipient, c.writerAddress)) {
      throw Errors.badRequest("A cancelled cheque must return to the writer's wallet address.");
    }
    return { recipient, recipientTagOwner: null };
  }

  // action === "cash"
  if (c.recipientTag) {
    const owner = await lookupTag(c.recipientTag);
    if (!owner) {
      throw Errors.badRequest(`This cheque is made out to ${formatTag(c.recipientTag)}, which is no longer registered.`);
    }
    if (!sameNimAddress(recipient, owner.address)) {
      throw Errors.forbidden(`This cheque is made out to ${formatTag(c.recipientTag)} and can only be cashed to their wallet.`);
    }
    return { recipient: owner.address, recipientTagOwner: owner };
  }

  if (sameNimAddress(recipient, c.writerAddress)) {
    throw Errors.badRequest("You wrote this cheque. Use Cancel to return the funds to your wallet.");
  }

  return { recipient, recipientTagOwner: null };
}

/** Handle the two-step non-custodial claim / cancel protocol (`prepare` -> `broadcast`). */
export async function handleChequeClaim(id: string, input: z.output<typeof ChequeClaimBody>, sessionAddress: string | null) {
  let c = await getCheque(id);
  if (!c) throw Errors.notFound("No cheque found with that link or code.");
  if (c.status === "pending") c = await reconcileCheque(c);

  const { recipient, recipientTagOwner } = await validateClaimRules(c, input.action, input.recipientAddress, sessionAddress);

  const txFields: BasicTxFields = {
    senderPublicKey: c.chequePublicKey,
    recipient,
    value: c.amount,
    fee: 0,
    validityStartHeight: input.validityStartHeight,
  };

  if (input.step === "prepare") {
    const srv = serverChequeKey(c.id);
    const txContent = serializeBasicTxContent(txFields);
    const partial = serverPartialSignTx({
      serverScalar: srv.scalar,
      chequePublicKey: c.chequePublicKey,
      clientNoncePublicKey: input.clientNoncePublicKey.toLowerCase(),
      txContent,
    });
    return {
      step: "prepared" as const,
      recipient,
      validityStartHeight: input.validityStartHeight,
      serverNoncePublicKey: partial.serverNoncePublicKey,
      serverPartialSig: partial.serverPartialSig,
      txHash: hashBasicTxContent(txFields),
    };
  }

  // step === "broadcast"
  const check = verifyRawBasicTx(input.rawTx.toLowerCase(), txFields);
  if (!check.valid) {
    throw Errors.validation("Invalid cheque signature. Make sure you opened the full cheque link or entered the complete cheque code.");
  }

  const txHash = await nimiq.sendRawTransaction(input.rawTx.toLowerCase());

  const db = await getDb();
  const [recipientMerchant] = await db.select().from(schema.merchants).where(eq(schema.merchants.address, recipient));
  const claimedByName =
    input.action === "cancel" ? c.writerName : recipientTagOwner?.name || recipientMerchant?.name || input.claimerName?.trim() || "Someone";
  const claimedByTag = input.action === "cancel" ? c.writerTag : (recipientTagOwner?.tag ?? recipientMerchant?.tag ?? null);

  const [updated] = await db
    .update(schema.cheques)
    .set({
      status: input.action === "cancel" ? "cancelled" : "cashed",
      settleTxHash: txHash.toLowerCase(),
      settledAt: new Date(),
      claimedByAddress: recipient,
      claimedByName,
      claimedByTag,
    })
    .where(and(eq(schema.cheques.id, c.id), eq(schema.cheques.status, "funded")))
    .returning();

  const finalCheque = updated ?? (await getCheque(c.id))!;
  return {
    step: "broadcast" as const,
    txHash: txHash.toLowerCase(),
    cheque: await publicChequeView(finalCheque, sessionAddress),
  };
}

/** Shape of a cheque shown to its writer or on the public `/c/[id]` page. */
export async function publicChequeView(c: Cheque, viewerAddress: string | null = null) {
  const db = await getDb();
  const [writer] = await db.select().from(schema.merchants).where(eq(schema.merchants.address, c.writerAddress));
  const recipientOwner = c.recipientTag ? await lookupTag(c.recipientTag) : null;

  return {
    id: c.id,
    number: chequeNumber(c.id),
    writer: {
      name: writer?.name || c.writerName || "Someone",
      tag: writer?.tag ?? c.writerTag ?? null,
      handle: (writer?.tag ?? c.writerTag) ? formatTag((writer?.tag ?? c.writerTag)!) : null,
      avatarUrl: writer ? merchantAvatarUrl(writer) : null,
    },
    chequeAddress: c.chequeAddress,
    chequePublicKey: c.chequePublicKey,
    recipient: c.recipientTag
      ? {
          kind: "tag" as const,
          tag: c.recipientTag,
          handle: formatTag(c.recipientTag),
          name: recipientOwner?.name || c.recipientName || formatTag(c.recipientTag),
          address: recipientOwner?.address ?? null,
          avatarUrl: recipientOwner?.avatarUrl ?? null,
        }
      : {
          kind: "free" as const,
          tag: null,
          handle: null,
          name: "First to claim",
          address: null,
          avatarUrl: null,
        },
    amount: c.amount,
    currency: c.currency,
    fiatAmount: c.fiatAmount,
    rate: c.rate,
    note: c.note,
    status: c.status,
    fundTxHash: c.fundTxHash,
    settleTxHash: c.settleTxHash,
    claimedBy:
      c.status === "cashed" || c.status === "cancelled"
        ? {
            name: c.claimedByName || "Someone",
            handle: c.claimedByTag ? formatTag(c.claimedByTag) : null,
          }
        : null,
    isWriter: !!viewerAddress && sameNimAddress(viewerAddress, c.writerAddress),
    createdAt: c.createdAt.toISOString(),
    fundedAt: c.fundedAt?.toISOString() ?? null,
    settledAt: c.settledAt?.toISOString() ?? null,
  };
}
export type PublicCheque = Awaited<ReturnType<typeof publicChequeView>>;
