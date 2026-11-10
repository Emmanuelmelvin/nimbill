"use client";
import { useState } from "react";
import { api, type MerchantInfo } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import { inNimiqPay, walletErrorMessage } from "@/lib/client/nimiq";
import { polygonWallet } from "@/lib/client/wallet";
import { Alert, Button, Card, Checkbox, Field, Input } from "./ui";

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
    if (!polygonWallet.available()) return setError("Open NimBill in Nimiq Pay to use your wallet's Polygon address, or paste one.");
    try {
      setEvm(await polygonWallet.requestAccount());
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
      <Field label="Your name or business" htmlFor="name">
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ada Studio" maxLength={80} required />
      </Field>

      <Card as="div" padding="sm">
        <Checkbox
          label="Also accept USDT"
          description="On Polygon. Clients need a little POL for the network fee."
          checked={usdt}
          onChange={(e) => setUsdt(e.target.checked)}
        />
        {usdt && (
          <div className="mt-3 space-y-2">
            <Input
              mono
              value={evm}
              onChange={(e) => setEvm(e.target.value.trim())}
              placeholder="0x… Polygon address that receives USDT"
              aria-label="Polygon address for USDT"
              required
            />
            {inNimiqPay() && (
              <Button variant="secondary" size="sm" block className="min-h-11" onClick={useWalletAddress}>
                Use my Nimiq Pay Polygon address
              </Button>
            )}
          </div>
        )}
      </Card>

      {error && <Alert kind="error">{error}</Alert>}
      {saved && !onSaved && <Alert kind="success">Saved.</Alert>}
      <Button type="submit" block loading={busy} disabled={!name.trim()}>
        {submitLabel}
      </Button>
    </form>
  );
}
