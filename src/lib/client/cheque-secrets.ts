"use client";
import {
  clientNonceForTx,
  completeDualSignature,
  isValidChequeSecret,
  normalizeChequeSecret,
  serializeBasicTxContent,
  type BasicTxFields,
} from "@/lib/cheque-crypto";
import type { PublicCheque } from "@/lib/cheques";
import { normalizeAddress } from "@/lib/nimiq-address";
import { api } from "./api";

const STORAGE_KEY = "nimbill:cheque-secrets:v1";

function readStore(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveChequeSecret(chequeId: string, rawSecret: string): void {
  if (typeof window === "undefined") return;
  const secret = normalizeChequeSecret(rawSecret);
  if (!isValidChequeSecret(secret)) return;
  try {
    const map = readStore();
    map[chequeId.toLowerCase()] = secret;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Private browsing or full storage: the link shown on screen still carries the secret.
  }
}

export function getSavedChequeSecret(chequeId: string): string | null {
  const map = readStore();
  const s = map[chequeId.toLowerCase()];
  return s && isValidChequeSecret(s) ? s : null;
}

/** Every cheque secret saved in this browser, for a backup the writer can keep elsewhere. */
export function allSavedChequeSecrets(): Record<string, string> {
  return Object.fromEntries(Object.entries(readStore()).filter(([, s]) => isValidChequeSecret(s)));
}

/**
 * Execute the non-custodial 2-of-2 cheque claim or cancel:
 * 1. Fetch the current block height and cheque balance from `/api/cheques/[id]`.
 * 2. Build the transaction locally and a fresh nonce commitment R_1 for it.
 * 3. Ask the server (`step: "prepare"`) to check the cheque's rules and return R_2 and s_2.
 * 4. Complete the 64-byte Ed25519 signature in the browser with `secret` (never sent to the server).
 *    Only the transaction built in step 2 is signed: nothing the server sends back can change
 *    the recipient, amount or block height.
 * 5. Send the signed 139-byte transaction (`step: "broadcast"`) for relay to the Nimiq network.
 */
export async function settleCheque(params: {
  id: string;
  secret: string;
  action: "cash" | "cancel";
  chequePublicKey: string;
  recipientAddress: string;
  claimerName?: string;
}): Promise<{ txHash: string; cheque: PublicCheque }> {
  const secret = normalizeChequeSecret(params.secret);
  const recipient = normalizeAddress(params.recipientAddress);
  if (!recipient) throw new Error("Enter a valid Nimiq address (starting with NQ).");

  const info = await api<{ cheque: PublicCheque; currentBlock: number; balance: string | null }>(
    `/api/cheques/${encodeURIComponent(params.id)}`,
  );
  if (info.cheque.status !== "funded" || !info.balance || info.balance === "0") {
    throw new Error(
      info.cheque.status === "settling" ? "This cheque is being cashed right now." : "This cheque can't be cashed right now.",
    );
  }
  if (info.cheque.chequePublicKey !== params.chequePublicKey) throw new Error("This cheque's key changed. Reload the page.");
  if (!info.currentBlock) throw new Error("The Nimiq network isn't reachable right now. Try again in a moment.");

  const tx: BasicTxFields = {
    senderPublicKey: params.chequePublicKey,
    recipient,
    value: info.balance,
    fee: 0,
    validityStartHeight: info.currentBlock,
  };
  const common = {
    action: params.action,
    recipientAddress: recipient,
    claimerName: params.claimerName,
    validityStartHeight: tx.validityStartHeight,
    value: info.balance,
  };

  const { nonceScalar, noncePublicKey } = clientNonceForTx(secret, serializeBasicTxContent(tx));

  const prepared = await api<{ step: "prepared"; serverNoncePublicKey: string; serverPartialSig: string }>(
    `/api/cheques/${encodeURIComponent(params.id)}/claim`,
    { body: { step: "prepare", ...common, clientNoncePublicKey: noncePublicKey } },
  );

  const { rawTx } = completeDualSignature({
    secret,
    tx,
    nonceScalar,
    serverNoncePublicKey: prepared.serverNoncePublicKey,
    serverPartialSig: prepared.serverPartialSig,
  });

  return api<{ txHash: string; cheque: PublicCheque }>(`/api/cheques/${encodeURIComponent(params.id)}/claim`, {
    body: { step: "broadcast", ...common, rawTx },
  });
}
