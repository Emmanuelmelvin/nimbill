"use client";
import { init, NimiqProviderError, type NimiqProvider } from "@nimiq/mini-app-sdk";
import { useEffect, useState } from "react";
import { AppError } from "@/lib/errors";

let providerPromise: Promise<NimiqProvider> | null = null;

/** True when the page is (very likely) running inside Nimiq Pay. */
export function inNimiqPay(): boolean {
  return typeof window !== "undefined" && (!!window.nimiqPay || !!window.nimiq);
}

/** Resolve the Nimiq provider once; rejects quickly when opened outside Nimiq Pay. */
export function getNimiq(): Promise<NimiqProvider> {
  if (!providerPromise) {
    providerPromise = init({ timeout: inNimiqPay() ? 10_000 : 1_500 }).catch((e) => {
      providerPromise = null;
      throw e;
    });
  }
  return providerPromise;
}

export type ProviderState = "checking" | "ready" | "unavailable";

export function useNimiq() {
  const [state, setState] = useState<ProviderState>("checking");
  const [provider, setProvider] = useState<NimiqProvider | null>(null);
  useEffect(() => {
    let alive = true;
    getNimiq()
      .then((p) => {
        if (!alive) return;
        setProvider(p);
        setState("ready");
      })
      .catch(() => alive && setState("unavailable"));
    return () => {
      alive = false;
    };
  }, []);
  return { state, provider };
}

export class Cancelled extends Error {}

/** Turn wallet / network errors into short, calm messages. Returns null for user cancellation. */
export function walletErrorMessage(e: unknown): string | null {
  if (e instanceof Cancelled) return null;
  if (AppError.is(e)) return e.publicMessage;
  if (NimiqProviderError.is(e)) {
    switch (e.type) {
      case "PERMISSION_DENIED":
        return null;
      case "NETWORK_ERROR":
        return "Nimiq Pay could not reach the network. Check your connection and try again.";
      case "INVALID_TRANSACTION":
        return "Nimiq Pay rejected the transaction. You may not have enough NIM.";
      case "UNKNOWN_REQUEST":
        return "Your Nimiq Pay version does not support this. Please update Nimiq Pay.";
      case "TRANSACTION_OUTCOME_UNKNOWN":
        return "The payment may have been sent. We'll keep checking — don't pay twice.";
      default:
        return e.message || "Nimiq Pay could not complete the request.";
    }
  }
  const err = e as { code?: number; message?: string };
  if (err?.code === 4001) return null; // EIP-1193 user rejected
  if (err?.message && /insufficient funds|gas/i.test(err.message)) {
    return "Not enough POL to pay the Polygon network fee. Add a little POL to your Nimiq Pay Polygon wallet.";
  }
  // A JavaScript error is a bug or an unexpected wallet answer, not something the client can act on.
  if (e instanceof SyntaxError || e instanceof TypeError || e instanceof RangeError) {
    console.error("[wallet]", e);
    return "Your wallet gave an answer we couldn't read, so nothing was sent. Please try again.";
  }
  return err?.message || "Something went wrong. Please try again.";
}

/** Link that opens a URL inside Nimiq Pay (installed app). */
export function openInNimiqPayLink(url: string): string {
  const withoutScheme = url.replace(/^https?:\/\//, "");
  return `https://nimpay.app/miniapps/open/${withoutScheme}`;
}

/** Nimiq payment request URI that any Nimiq wallet understands. */
export function nimiqPaymentUri(recipient: string, luna: string, message: string): string {
  const nim = (Number(luna) / 100_000).toString();
  return `nimiq:${recipient.replace(/\s/g, "")}?amount=${nim}&message=${encodeURIComponent(message)}`;
}

export const nimExplorerTx = (hash: string) => `https://nimiq.watch/#${hash}`;
export const polygonExplorerTx = (hash: string) => `https://polygonscan.com/tx/${hash}`;
