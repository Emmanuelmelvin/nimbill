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

/**
 * Execute the non-custodial 2-of-2 cheque claim or cancel:
 * 1. Fetch current block height from `/api/cheques/[id]`.
 * 2. Compute the client's nonce commitment R_1 for the exact BasicTxFields.
 * 3. Ask the server (`step: "prepare"`) to check the cheque's rules and return R_2 and s_2.
 * 4. Complete the 64-byte Ed25519 signature in the browser with `secret` (never sent to the server).
 * 5. Send the signed 139-byte transaction (`step: "broadcast"`) for relay to the Nimiq network.
 */
export async function settleCheque(params: {
  id: string;
  secret: string;
  action: "cash" | "cancel";
  chequePublicKey: string;
  amount: string;
  recipientAddress: string;
  claimerName?: string;
  currentBlock?: number;
}): Promise<{ txHash: string; cheque: PublicCheque }> {
  const secret = normalizeChequeSecret(params.secret);
  let validityStartHeight = params.currentBlock;
  if (!validityStartHeight) {
    const info = await api<{ cheque: PublicCheque; currentBlock: number }>(`/api/cheques/${params.id}`);
    validityStartHeight = info.currentBlock;
  }

  const tx: BasicTxFields = {
    senderPublicKey: params.chequePublicKey,
    recipient: params.recipientAddress,
    value: params.amount,
    fee: 0,
    validityStartHeight,
  };

  const txContent = serializeBasicTxContent(tx);
  const { noncePublicKey } = clientNonceForTx(secret, txContent);

  const prepared = await api<{
    step: "prepared";
    recipient: string;
    validityStartHeight: number;
    serverNoncePublicKey: string;
    serverPartialSig: string;
  }>(`/api/cheques/${params.id}/claim`, {
    body: {
      step: "prepare",
      action: params.action,
      recipientAddress: params.recipientAddress,
      claimerName: params.claimerName,
      validityStartHeight,
      clientNoncePublicKey: noncePublicKey,
    },
  });

  const finalTx: BasicTxFields = {
    ...tx,
    recipient: prepared.recipient,
    validityStartHeight: prepared.validityStartHeight,
  };

  const { rawTx } = completeDualSignature({
    secret,
    tx: finalTx,
    serverNoncePublicKey: prepared.serverNoncePublicKey,
    serverPartialSig: prepared.serverPartialSig,
  });

  return api<{ txHash: string; cheque: PublicCheque }>(`/api/cheques/${params.id}/claim`, {
    body: {
      step: "broadcast",
      action: params.action,
      recipientAddress: prepared.recipient,
      claimerName: params.claimerName,
      validityStartHeight: prepared.validityStartHeight,
      rawTx,
    },
  });
}
