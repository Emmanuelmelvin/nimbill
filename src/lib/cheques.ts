import "server-only";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
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
import type { Cheque, Merchant } from "./db/schema";
import { env, isProd } from "./env";
import { Errors } from "./errors";
import { newId } from "./invoices";
import { lookupTag, type TagOwner } from "./merchant-tags";
import { enforceLimit } from "./rate-limit";
import { normalizeAddress } from "./nimiq-address";
import { getRate } from "./rates";
import type { ChequeClaimBody, NewChequeBody } from "./schemas";
import { formatTag } from "./tags";

const HOUR = 3_600_000;
/** Unfunded cheques older than a day were never paid in the wallet and are hidden from the list. */
const PENDING_SHOWN_MS = 24 * HOUR;
/** Most cheques one wallet can start in an hour. */
const MAX_STARTED_PER_HOUR = 30;
/**
 * A broadcast cash/cancel transaction that still isn't in a block after this long has expired
 * (Nimiq transactions are valid for about two hours), so the cheque goes back to "funded".
 */
const SETTLE_TIMEOUT_MS = 3 * HOUR;

type ChequeStatus = Cheque["status"];
const isFinal = (s: ChequeStatus) => s === "cashed" || s === "cancelled";

/** The data attached to the NIM funding transaction. Max 64 bytes. */
export const chequeMemo = (id: string) => `NimBill C ${id}`;

const DEV_CHEQUE_KEY = "nimbill-local-dev-cheque-key-v1";

/**
 * Which secret new cheques derive their server key from: the dedicated CHEQUE_KEY_SECRET when it
 * is set, otherwise SESSION_SECRET (so a deployment without the new variable keeps working).
 * Each cheque records its choice, so setting CHEQUE_KEY_SECRET later doesn't affect open cheques.
 */
function newChequeKeyRef(): "cheque" | "session" {
  return env.CHEQUE_KEY_SECRET || !env.SESSION_SECRET ? "cheque" : "session";
}

/** Deterministic server half of the 2-of-2 cheque key for `chequeId`. */
function serverChequeKey(chequeId: string, keyRef: string) {
  let secret: string | undefined;
  if (keyRef === "cheque") secret = env.CHEQUE_KEY_SECRET;
  else if (keyRef === "session")
    secret = env.SESSION_SECRET; // cheques written before CHEQUE_KEY_SECRET
  else throw Errors.config(`Unknown cheque key reference "${keyRef}".`);
  if (!secret) {
    if (isProd) throw Errors.config(`The secret for cheque key "${keyRef}" is not set.`);
    secret = DEV_CHEQUE_KEY;
  }
  const seed = hmac(sha256, utf8ToBytes(secret), utf8ToBytes(`cheque-server-key-v1:${chequeId}`));
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
    .select({ createdAt: schema.cheques.createdAt })
    .from(schema.cheques)
    .where(and(eq(schema.cheques.writerAddress, writerAddress), gt(schema.cheques.createdAt, new Date(Date.now() - HOUR))));
  enforceLimit({
    used: recent.length,
    limit: MAX_STARTED_PER_HOUR,
    resetAt: Math.min(Date.now(), ...recent.map((r) => r.createdAt.getTime())) + HOUR,
    message: "You've started a lot of cheques in the last hour. Try again later.",
  });

  let recipient: TagOwner | null = null;
  if (input.recipientTag) {
    recipient = await lookupTag(input.recipientTag);
    if (!recipient) throw Errors.notFound("No one has that tag. Check the spelling.");
    if (sameNimAddress(recipient.address, writerAddress)) {
      throw Errors.badRequest("That's your own tag. Pick someone else, or make it a free cheque.");
    }
  }

  const [me] = await db.select().from(schema.merchants).where(eq(schema.merchants.address, writerAddress));

  const rate = input.currency === "NIM" ? 1 : await getRate("NIM", input.currency);
  const step = LUNA_PER_NIM / 100;
  const luna =
    input.currency === "NIM"
      ? Math.round(input.amount * LUNA_PER_NIM)
      : Math.max(step, Math.ceil(((input.amount / rate) * LUNA_PER_NIM) / step) * step);
  if (!Number.isFinite(luna) || luna < 1) throw Errors.validation("The amount is too small for a cheque.");
  if (!Number.isSafeInteger(luna)) throw Errors.validation("That amount is too large for a cheque.");

  const id = newId();
  const keyRef = newChequeKeyRef();
  const srv = serverChequeKey(id, keyRef);
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
      keyRef,
      recipientTag: recipient?.tag ?? null,
      recipientName: recipient?.name ?? null,
      recipientAddress: recipient?.address ?? null,
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
  | { status: "funded" | "settling" | "cashed" | "cancelled"; cheque: Cheque }
  | { status: "pending"; message: string }
  | { status: "rejected"; message: string };

/** Verify the funding transaction sent from the writer's wallet to `chequeAddress`. */
export async function verifyChequeFunding(c: Cheque, txHash?: string): Promise<ChequeVerifyResult> {
  if (c.status !== "pending") return { status: c.status, cheque: c };
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
  if (reconciled.status !== "pending") return { status: reconciled.status, cheque: reconciled };
  return { status: "pending", message: "Waiting for the funding transaction on the blockchain…" };
}

/** Check the cheque wallet's on-chain transactions to catch up with funding or settlement. */
export async function reconcileCheque(c: Cheque): Promise<Cheque> {
  if (isFinal(c.status)) return c;
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

  if (current.status !== "funded" && current.status !== "settling") return current;
  const db = await getDb();

  const outTx = txs.find((tx) => tx.executionResult && sameNimAddress(tx.from, current.chequeAddress));
  if (outTx) {
    const isCancel = sameNimAddress(outTx.to, current.writerAddress);
    const [recipientMerchant] = await db.select().from(schema.merchants).where(eq(schema.merchants.address, outTx.to));
    const ownBroadcast = current.settleTxHash === outTx.hash.toLowerCase();
    const [updated] = await db
      .update(schema.cheques)
      .set({
        status: isCancel ? "cancelled" : "cashed",
        settleTxHash: outTx.hash.toLowerCase(),
        settledAt: new Date(outTx.timestamp),
        claimedByAddress: outTx.to,
        claimedByName:
          recipientMerchant?.name || (ownBroadcast ? current.claimedByName : null) || (isCancel ? current.writerName : "Someone"),
        claimedByTag: recipientMerchant?.tag ?? (ownBroadcast ? current.claimedByTag : null) ?? null,
      })
      .where(and(eq(schema.cheques.id, current.id), inArray(schema.cheques.status, ["funded", "settling"])))
      .returning();
    return updated ?? (await getCheque(current.id)) ?? current;
  }

  // A broadcast that never made it into a block has expired: the cheque can be cashed again.
  if (current.status === "settling" && current.settledAt && Date.now() - current.settledAt.getTime() > SETTLE_TIMEOUT_MS) {
    const [reverted] = await db
      .update(schema.cheques)
      .set(UNSETTLED)
      .where(and(eq(schema.cheques.id, current.id), eq(schema.cheques.status, "settling")))
      .returning();
    if (reverted) return reverted;
  }
  return current;
}

const UNSETTLED = {
  status: "funded" as const,
  settleTxHash: null,
  settledAt: null,
  claimedByAddress: null,
  claimedByName: null,
  claimedByTag: null,
};

/** Reconcile recent pending, funded or settling cheques written by `writerAddress`. */
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
          inArray(schema.cheques.status, ["funded", "settling"]),
        ),
      ),
    )
    .limit(10);
  await Promise.all(active.map((c) => reconcileCheque(c)));
}

/**
 * Every cheque that involves `address`: ones they wrote, ones they cashed (into this wallet), and
 * funded ones made out to their @tag. Newest first.
 */
export async function listCheques(address: string): Promise<Cheque[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.cheques)
    .where(
      or(
        and(
          eq(schema.cheques.writerAddress, address),
          or(
            inArray(schema.cheques.status, ["funded", "settling", "cashed", "cancelled"]),
            gt(schema.cheques.createdAt, new Date(Date.now() - PENDING_SHOWN_MS)),
          ),
        ),
        and(eq(schema.cheques.claimedByAddress, address), inArray(schema.cheques.status, ["settling", "cashed"])),
        and(eq(schema.cheques.recipientAddress, address), inArray(schema.cheques.status, ["funded", "settling", "cashed"])),
      ),
    )
    .orderBy(desc(schema.cheques.createdAt))
    .limit(200);
}

/** Live balance (Luna) of a cheque wallet: what cashing or cancelling moves out. */
export async function chequeBalance(c: Cheque): Promise<string | null> {
  if (c.status !== "funded") return null;
  try {
    return String(await nimiq.getBalance(c.chequeAddress));
  } catch {
    return null;
  }
}

/** Validate that `recipientAddress` and `action` obey the cheque's rules before co-signing or broadcasting. */
async function validateClaimRules(
  c: Cheque,
  action: "cash" | "cancel",
  rawRecipientAddress: string,
  sessionAddress: string | null,
): Promise<{ recipient: string; recipientTagOwner: { tag: string; name: string } | null }> {
  if (c.status === "cashed") throw Errors.badRequest("This cheque has already been cashed.");
  if (c.status === "cancelled") throw Errors.badRequest("This cheque was cancelled by its writer.");
  if (c.status === "settling") throw Errors.conflict("This cheque is being cashed right now. Check back in a minute.");
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
    // The wallet is fixed when the cheque is written. Only cheques from before that change fall
    // back to whoever owns the tag today.
    let locked = c.recipientAddress;
    if (!locked) {
      const owner = await lookupTag(c.recipientTag);
      if (!owner) {
        throw Errors.badRequest(`This cheque is made out to ${formatTag(c.recipientTag)}, which is no longer registered.`);
      }
      locked = owner.address;
    }
    if (!sameNimAddress(recipient, locked)) {
      throw Errors.forbidden(`This cheque is made out to ${formatTag(c.recipientTag)} and can only be cashed to their wallet.`);
    }
    return { recipient: normalizeAddress(locked)!, recipientTagOwner: { tag: c.recipientTag, name: c.recipientName || "" } };
  }

  if (sameNimAddress(recipient, c.writerAddress)) {
    throw Errors.badRequest("You wrote this cheque. Use Cancel to return the funds to your wallet.");
  }

  return { recipient, recipientTagOwner: null };
}

/**
 * The transaction must move the cheque's whole balance (so an overfunded cheque doesn't strand
 * the extra NIM), and at least the written amount.
 */
async function checkClaimValue(c: Cheque, rawValue: string): Promise<bigint> {
  const value = BigInt(rawValue);
  if (value < BigInt(c.amount)) throw Errors.validation("The amount must be the cheque's full balance.");
  const balance = BigInt(await nimiq.getBalance(c.chequeAddress));
  if (value !== balance) {
    throw Errors.conflict("The cheque's balance changed. Reload the cheque and try again.", {
      details: { expected: balance.toString(), got: rawValue },
    });
  }
  return value;
}

/** Handle the two-step non-custodial claim / cancel protocol (`prepare` -> `broadcast`). */
export async function handleChequeClaim(id: string, input: z.output<typeof ChequeClaimBody>, sessionAddress: string | null) {
  let c = await getCheque(id);
  if (!c) throw Errors.notFound("No cheque found with that link or code.");
  if (c.status === "pending" || c.status === "settling") c = await reconcileCheque(c);

  const { recipient, recipientTagOwner } = await validateClaimRules(c, input.action, input.recipientAddress, sessionAddress);
  const value = await checkClaimValue(c, input.value);

  const txFields: BasicTxFields = {
    senderPublicKey: c.chequePublicKey,
    recipient,
    value,
    fee: 0,
    validityStartHeight: input.validityStartHeight,
  };

  if (input.step === "prepare") {
    const srv = serverChequeKey(c.id, c.keyRef);
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
      value: value.toString(),
      serverNoncePublicKey: partial.serverNoncePublicKey,
      serverPartialSig: partial.serverPartialSig,
      txHash: hashBasicTxContent(txFields),
    };
  }

  // step === "broadcast"
  const rawTx = input.rawTx.toLowerCase();
  const check = verifyRawBasicTx(rawTx, txFields);
  if (!check.valid) {
    throw Errors.validation("Invalid cheque signature. Make sure you opened the full cheque link or entered the complete cheque code.");
  }

  const db = await getDb();
  const [recipientMerchant] = await db.select().from(schema.merchants).where(eq(schema.merchants.address, recipient));
  const claimedByName =
    input.action === "cancel" ? c.writerName : recipientTagOwner?.name || recipientMerchant?.name || input.claimerName?.trim() || "Someone";
  const claimedByTag = input.action === "cancel" ? c.writerTag : (recipientTagOwner?.tag ?? recipientMerchant?.tag ?? null);

  // Reserve the cheque first, so two claimers can't both be told they cashed it. It only becomes
  // "cashed" or "cancelled" once the transaction is seen in a block (see reconcileCheque).
  const [reserved] = await db
    .update(schema.cheques)
    .set({
      status: "settling",
      settleTxHash: check.txHash,
      settledAt: new Date(),
      claimedByAddress: recipient,
      claimedByName,
      claimedByTag,
    })
    .where(and(eq(schema.cheques.id, c.id), eq(schema.cheques.status, "funded")))
    .returning();
  if (!reserved) throw Errors.conflict("Someone else is cashing this cheque right now.");

  let txHash: string;
  try {
    txHash = (await nimiq.sendRawTransaction(rawTx)).toLowerCase();
  } catch (e) {
    await db
      .update(schema.cheques)
      .set(UNSETTLED)
      .where(and(eq(schema.cheques.id, c.id), eq(schema.cheques.settleTxHash, check.txHash)));
    throw e;
  }

  return {
    step: "broadcast" as const,
    txHash,
    cheque: await publicChequeView(reserved, sessionAddress),
  };
}

type ViewContext = { writers: Map<string, Merchant | undefined>; tags: Map<string, TagOwner | null> };

async function loadViewContext(rows: Cheque[]): Promise<ViewContext> {
  const db = await getDb();
  const writerAddrs = [...new Set(rows.map((c) => c.writerAddress))];
  const merchants = writerAddrs.length
    ? await db.select().from(schema.merchants).where(inArray(schema.merchants.address, writerAddrs))
    : [];
  const writers = new Map(writerAddrs.map((a) => [a, merchants.find((m) => m.address === a)]));
  const tagList = [...new Set(rows.map((c) => c.recipientTag).filter((t): t is string => !!t))];
  const owners = await Promise.all(tagList.map((t) => lookupTag(t)));
  return { writers, tags: new Map(tagList.map((t, i) => [t, owners[i]])) };
}

function chequeDirection(c: Cheque, viewer: string | null): "written" | "received" | null {
  if (!viewer) return null;
  if (sameNimAddress(viewer, c.writerAddress)) return "written";
  const toViewer =
    (c.claimedByAddress && sameNimAddress(viewer, c.claimedByAddress) && c.status !== "cancelled") ||
    (c.recipientAddress && sameNimAddress(viewer, c.recipientAddress));
  return toViewer ? "received" : null;
}

function buildView(c: Cheque, ctx: ViewContext, viewerAddress: string | null) {
  const writer = ctx.writers.get(c.writerAddress);
  const tagOwner = c.recipientTag ? (ctx.tags.get(c.recipientTag) ?? null) : null;
  // Show the current owner's name and photo only while the tag still points at the locked wallet.
  const sameOwner = tagOwner && (!c.recipientAddress || sameNimAddress(tagOwner.address, c.recipientAddress));
  const writerTag = writer?.tag ?? c.writerTag ?? null;

  return {
    id: c.id,
    number: chequeNumber(c.id),
    writer: {
      name: writer?.name || c.writerName || "Someone",
      tag: writerTag,
      handle: writerTag ? formatTag(writerTag) : null,
      avatarUrl: writer ? merchantAvatarUrl(writer) : null,
    },
    chequeAddress: c.chequeAddress,
    chequePublicKey: c.chequePublicKey,
    recipient: c.recipientTag
      ? {
          kind: "tag" as const,
          tag: c.recipientTag,
          handle: formatTag(c.recipientTag),
          name: (sameOwner ? tagOwner?.name : null) || c.recipientName || formatTag(c.recipientTag),
          address: c.recipientAddress ?? tagOwner?.address ?? null,
          avatarUrl: sameOwner ? (tagOwner?.avatarUrl ?? null) : null,
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
      c.status === "settling" || isFinal(c.status)
        ? {
            name: c.claimedByName || "Someone",
            handle: c.claimedByTag ? formatTag(c.claimedByTag) : null,
          }
        : null,
    isWriter: !!viewerAddress && sameNimAddress(viewerAddress, c.writerAddress),
    /** How the cheque relates to the viewer: they wrote it, or it was cashed into / made out to their wallet. */
    direction: chequeDirection(c, viewerAddress),
    createdAt: c.createdAt.toISOString(),
    fundedAt: c.fundedAt?.toISOString() ?? null,
    settledAt: c.settledAt?.toISOString() ?? null,
  };
}

/** Shape of a cheque shown to its writer or on the public `/c/[id]` page. */
export async function publicChequeView(c: Cheque, viewerAddress: string | null = null) {
  return buildView(c, await loadViewContext([c]), viewerAddress);
}
export type PublicCheque = ReturnType<typeof buildView>;

/** Views for many cheques with one merchant query and one lookup per distinct tag. */
export async function publicChequeViews(rows: Cheque[], viewerAddress: string | null = null): Promise<PublicCheque[]> {
  const ctx = await loadViewContext(rows);
  return rows.map((c) => buildView(c, ctx, viewerAddress));
}
