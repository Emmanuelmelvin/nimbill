"use client";
import { useState } from "react";
import { api, type MerchantInfo } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import { inNimiqPay, walletErrorMessage } from "@/lib/client/nimiq";
import { Notice, Spinner } from "./ui";

type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

export function ProfileForm({ submitLabel = "Save", onSaved }: { submitLabel?: string; onSaved?: () => void }) {
  const { merchant, setMerchant } = useSession();
  const [name, setName] = useState(merchant?.name ?? "");
  const [usdt, setUsdt] = useState(!!merchant?.evmAddress);
  const [evm, setEvm] = useState(merchant?.evmAddress ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function useWalletAddress() {
    setError(null);
    const eth = (window as unknown as { ethereum?: Eth }).ethereum;
    if (!eth) return setError("Open NimBill in Nimiq Pay to use your wallet's Polygon address, or paste one.");
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      if (accounts?.[0]) setEvm(accounts[0]);
    } catch (e) {
      const m = walletErrorMessage(e);
      if (m) setError(m);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        setSaved(false);
        try {
          const { merchant: m } = await api<{ merchant: MerchantInfo }>("/api/me", {
            body: { name, evmAddress: usdt ? evm || null : null },
          });
          setMerchant(m);
          setSaved(true);
          onSaved?.();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <label className="label" htmlFor="name">
          Your name or business
        </label>
        <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ada Studio" maxLength={80} required />
      </div>

      <div className="rounded-xl border border-line p-4">
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
          <span>
            <span className="block font-medium">Also accept USDT</span>
            <span className="block text-sm text-muted">On Polygon. Clients need a little POL for the network fee.</span>
          </span>
          <input type="checkbox" className="h-6 w-6 accent-[#1f2348]" checked={usdt} onChange={(e) => setUsdt(e.target.checked)} />
        </label>
        {usdt && (
          <div className="mt-3 space-y-2">
            <input
              className="input font-mono text-sm"
              value={evm}
              onChange={(e) => setEvm(e.target.value.trim())}
              placeholder="0x… Polygon address that receives USDT"
              aria-label="Polygon address for USDT"
              required
            />
            {inNimiqPay() && (
              <button type="button" className="btn-ghost w-full text-sm" onClick={useWalletAddress}>
                Use my Nimiq Pay Polygon address
              </button>
            )}
          </div>
        )}
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {saved && !onSaved && <Notice kind="success">Saved.</Notice>}
      <button className="btn-primary w-full" disabled={busy || !name.trim()}>
        {busy ? <Spinner /> : submitLabel}
      </button>
    </form>
  );
}
