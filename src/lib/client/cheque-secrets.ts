"use client";
import {
  buildAndSignHtlcTimeoutResolveTx,
  chequeHtlcPreImage,
  clientNonceForTx,
  completeDualHtlcCreationSignature,
  completeDualHtlcRegularTransferSignature,
  completeDualSignature,
  isValidChequeSecret,
  normalizeChequeSecret,
  serializeBasicTxContent,
  serializeHtlcCreationTxContent,
  serializeHtlcSpendTxContent,
  type BasicTxFields,
  type HtlcCreationTxFields,
  type HtlcSpendTxFields,
} from "@/lib/cheque-crypto";
import type { PublicCheque } from "@/lib/cheques";
import { normalizeAddress } from "@/lib/nimiq-address";
import { api } from "./api";

const STORAGE_KEY = "nimbill:cheque-secrets:v1";
const PUBLIC_NIMIQ_RPC_URL = "https://rpc.nimiqwatch.com";

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
 * Lock a funded cheque's balance into its Nimiq HTLC contract (`prepare` -> `broadcast`).
 * Runs automatically right after the funding transaction confirms on-chain so the writer has a
 * guaranteed on-chain timeout refund even if NimBill's server goes offline forever.
 */
export async function lockChequeInHtlc(params: {
  id: string;
  secret: string;
}): Promise<{ txHash: string; htlcAddress: string; cheque: PublicCheque }> {
  const secret = normalizeChequeSecret(params.secret);
  const info = await api<{
    cheque: PublicCheque;
    currentBlock: number;
    balance: string | null;
    spendFrom?: "basic" | "htlc";
  }>(`/api/cheques/${encodeURIComponent(params.id)}`);

  if (!info.cheque.htlc?.refundAddress || !info.cheque.htlc?.timeoutMs) {
    return { txHash: "", htlcAddress: "", cheque: info.cheque };
  }
  if (info.spendFrom === "htlc" && info.cheque.htlc.contractAddress) {
    return {
      txHash: info.cheque.htlc.txHash ?? "",
      htlcAddress: info.cheque.htlc.contractAddress,
      cheque: info.cheque,
    };
  }
  if (info.cheque.status !== "funded" || !info.balance || info.balance === "0") {
    throw new Error("Cheque is not funded yet.");
  }
  if (!info.currentBlock) throw new Error("The Nimiq network isn't reachable right now.");

  const { hashRoot } = chequeHtlcPreImage(params.id);
  const tx: HtlcCreationTxFields = {
    senderPublicKey: info.cheque.chequePublicKey,
    htlcSenderAddress: info.cheque.htlc.refundAddress,
    htlcRecipientAddress: info.cheque.chequeAddress,
    hashRoot,
    timeoutMs: info.cheque.htlc.timeoutMs,
    value: info.balance,
    fee: 0,
    validityStartHeight: info.currentBlock,
  };
  const { txContent } = serializeHtlcCreationTxContent(tx);
  const { nonceScalar, noncePublicKey } = clientNonceForTx(secret, txContent);
  const common = { validityStartHeight: tx.validityStartHeight, value: info.balance };

  const prepared = await api<{
    step: "prepared" | "already_locked";
    htlcAddress: string;
    txHash?: string;
    cheque?: PublicCheque;
    serverNoncePublicKey?: string;
    serverPartialSig?: string;
  }>(`/api/cheques/${encodeURIComponent(params.id)}/htlc`, {
    body: { step: "prepare", ...common, clientNoncePublicKey: noncePublicKey },
  });

  if (prepared.step === "already_locked" && prepared.cheque) {
    return { txHash: prepared.txHash ?? "", htlcAddress: prepared.htlcAddress, cheque: prepared.cheque };
  }
  if (!prepared.serverNoncePublicKey || !prepared.serverPartialSig) {
    throw new Error("Server did not return a partial signature for the HTLC lock.");
  }

  const { rawTx } = completeDualHtlcCreationSignature({
    secret,
    tx,
    nonceScalar,
    serverNoncePublicKey: prepared.serverNoncePublicKey,
    serverPartialSig: prepared.serverPartialSig,
  });

  return api<{ txHash: string; htlcAddress: string; cheque: PublicCheque }>(
    `/api/cheques/${encodeURIComponent(params.id)}/htlc`,
    { body: { step: "broadcast", ...common, rawTx } },
  );
}

/**
 * Execute the non-custodial 2-of-2 cheque claim or cancel:
 * 1. Fetch the current block height, cheque balance, and whether the funds sit in the cheque's
 *    Nimiq HTLC contract (`spendFrom: "htlc"`) or Basic wallet (`spendFrom: "basic"`).
 * 2. Build the transaction locally and a fresh nonce commitment R_1 for it.
 * 3. Ask the server (`step: "prepare"`) to check the cheque's rules and return R_2 and s_2.
 * 4. Complete the 64-byte Ed25519 signature in the browser with `secret` (never sent to the server).
 *    Only the transaction built in step 2 is signed: nothing the server sends back can change
 *    the recipient, amount or block height.
 * 5. Send the signed transaction (`step: "broadcast"`) for relay to the Nimiq network.
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

  const info = await api<{
    cheque: PublicCheque;
    currentBlock: number;
    balance: string | null;
    spendFrom?: "basic" | "htlc";
  }>(`/api/cheques/${encodeURIComponent(params.id)}`);
  if (info.cheque.status !== "funded" || !info.balance || info.balance === "0") {
    throw new Error(
      info.cheque.status === "settling" ? "This cheque is being cashed right now." : "This cheque can't be cashed right now.",
    );
  }
  if (info.cheque.chequePublicKey !== params.chequePublicKey) throw new Error("This cheque's key changed. Reload the page.");
  if (!info.currentBlock) throw new Error("The Nimiq network isn't reachable right now. Try again in a moment.");

  const spendFrom: "basic" | "htlc" = info.spendFrom === "htlc" && info.cheque.htlc?.contractAddress ? "htlc" : "basic";
  const common = {
    action: params.action,
    recipientAddress: recipient,
    claimerName: params.claimerName,
    validityStartHeight: info.currentBlock,
    value: info.balance,
    spendFrom,
  };

  if (spendFrom === "htlc" && info.cheque.htlc?.contractAddress) {
    const htlcTx: HtlcSpendTxFields = {
      htlcAddress: info.cheque.htlc.contractAddress,
      recipient,
      value: info.balance,
      fee: 0,
      validityStartHeight: info.currentBlock,
    };
    const { nonceScalar, noncePublicKey } = clientNonceForTx(secret, serializeHtlcSpendTxContent(htlcTx));
    const prepared = await api<{ step: "prepared"; serverNoncePublicKey: string; serverPartialSig: string }>(
      `/api/cheques/${encodeURIComponent(params.id)}/claim`,
      { body: { step: "prepare", ...common, clientNoncePublicKey: noncePublicKey } },
    );
    const { rawTx } = completeDualHtlcRegularTransferSignature({
      secret,
      chequeId: params.id,
      chequePublicKey: params.chequePublicKey,
      tx: htlcTx,
      nonceScalar,
      serverNoncePublicKey: prepared.serverNoncePublicKey,
      serverPartialSig: prepared.serverPartialSig,
    });
    return api<{ txHash: string; cheque: PublicCheque }>(`/api/cheques/${encodeURIComponent(params.id)}/claim`, {
      body: { step: "broadcast", ...common, rawTx },
    });
  }

  const tx: BasicTxFields = {
    senderPublicKey: params.chequePublicKey,
    recipient,
    value: info.balance,
    fee: 0,
    validityStartHeight: info.currentBlock,
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

async function directNimiqRpc<T>(rpcUrl: string, method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`Nimiq RPC HTTP ${res.status}`);
  const body = (await res.json()) as { result?: { data?: T } | T; error?: { message?: string; data?: string } };
  if (body.error) throw new Error(body.error.data || body.error.message || "Nimiq RPC error");
  const r = body.result as { data?: T } | T | undefined;
  return (r && typeof r === "object" && "data" in r ? (r as { data: T }).data : (r as T));
}

/**
 * Reclaim an expired HTLC-protected cheque directly from the Nimiq blockchain using only the
 * link secret (`OutgoingHTLCTransactionProof::TimeoutResolve`).
 *
 * Works with zero NimBill server calls when `htlcAddress` and `recipientAddress` are provided.
 */
export async function reclaimExpiredHtlcCheque(params: {
  id?: string;
  secret: string;
  htlcAddress: string;
  recipientAddress: string;
  rpcUrl?: string;
}): Promise<{ txHash: string; rawTx: string; valueLuna: string }> {
  const rpcUrl = params.rpcUrl || PUBLIC_NIMIQ_RPC_URL;
  const htlcAddress = normalizeAddress(params.htlcAddress);
  const recipient = normalizeAddress(params.recipientAddress);
  if (!htlcAddress) throw new Error("Enter a valid HTLC contract address (NQ…).");
  if (!recipient) throw new Error("Enter a valid Nimiq wallet address (NQ…) to receive the refund.");

  const [acc, currentBlock] = await Promise.all([
    directNimiqRpc<{ balance?: number }>(rpcUrl, "getAccountByAddress", [htlcAddress]),
    directNimiqRpc<number>(rpcUrl, "getBlockNumber", []),
  ]);
  const balance = BigInt(acc?.balance ?? 0);
  if (balance <= BigInt(0)) {
    throw new Error("This HTLC contract has a 0 NIM balance (it may already have been cashed or reclaimed).");
  }
  if (!currentBlock || currentBlock <= 0) {
    throw new Error("Could not read the current block height from the Nimiq RPC node.");
  }

  const built = buildAndSignHtlcTimeoutResolveTx({
    secret: params.secret,
    chequeId: params.id,
    tx: {
      htlcAddress,
      recipient,
      value: balance,
      fee: 0,
      validityStartHeight: currentBlock,
    },
  });

  const broadcastHash = await directNimiqRpc<string>(rpcUrl, "sendRawTransaction", [built.rawTx]);
  return {
    txHash: (broadcastHash || built.txHash).toLowerCase(),
    rawTx: built.rawTx,
    valueLuna: balance.toString(),
  };
}
