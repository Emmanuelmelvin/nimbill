"use client";
import { useCallback, useEffect, useState } from "react";
import { api, type MerchantInfo } from "./api";
import { getNimiq, walletErrorMessage } from "./nimiq";

let cache: MerchantInfo | null | undefined;
const listeners = new Set<(m: MerchantInfo | null) => void>();
function publish(m: MerchantInfo | null) {
  cache = m;
  listeners.forEach((l) => l(m));
}

export function useSession() {
  const [merchant, setMerchant] = useState<MerchantInfo | null | undefined>(cache);
  useEffect(() => {
    listeners.add(setMerchant);
    if (cache === undefined) {
      api<{ merchant: MerchantInfo | null }>("/api/auth/me")
        .then((r) => publish(r.merchant))
        .catch(() => publish(null));
    }
    return () => {
      listeners.delete(setMerchant);
    };
  }, []);
  return { merchant, loading: merchant === undefined, setMerchant: publish };
}

/** Sign in by signing a one-time challenge in Nimiq Pay. Returns an error message, or null on success/cancel. */
export function useSignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const nimiq = await getNimiq();
      const { message } = await api<{ message: string }>("/api/auth/challenge");
      const { publicKey, signature } = await nimiq.sign(message);
      const { merchant } = await api<{ merchant: MerchantInfo }>("/api/auth/verify", {
        body: { message, publicKey, signature },
      });
      publish(merchant);
    } catch (e) {
      const msg = walletErrorMessage(e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }, []);
  return { signIn, busy, error };
}

export async function signOut() {
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  publish(null);
}
