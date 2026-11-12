"use client";
import { useState } from "react";
import { api, type MerchantInfo } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import { inNimiqPay, walletErrorMessage } from "@/lib/client/nimiq";
import { polygonWallet } from "@/lib/client/wallet";
import { TAG_CHANGE_COOLDOWN_DAYS, suggestTag } from "@/lib/tags";
import { TagField, useTagStatus } from "./TagField";
import { Alert, Button, Card, Checkbox, Field, Input } from "./ui";

export function ProfileForm({
  submitLabel = "Save",
  onSaved,
  withEmail,
}: {
  submitLabel?: string;
  onSaved?: () => void;
  /** Show the optional "invoice paid" email field (settings only; the welcome step stays short). */
  withEmail?: boolean;
}) {
  const { merchant, setMerchant } = useSession();
  const [name, setName] = useState(merchant?.name ?? "");
  const [usdt, setUsdt] = useState(!!merchant?.evmAddress);
  const [evm, setEvm] = useState(merchant?.evmAddress ?? "");
  const [email, setEmail] = useState(merchant?.email ?? "");
  const [tag, setTag] = useState(merchant?.tag ?? suggestTag(merchant?.name ?? ""));
  // Until the person types a tag themselves, it follows their name.
  const [tagEdited, setTagEdited] = useState(!!merchant?.tag);
  const tagCheck = useTagStatus(tag, merchant?.tag);
  const [openedAt] = useState(() => Date.now());
  const nextTagChange =
    merchant?.tag && merchant.tagChangedAt ? new Date(merchant.tagChangedAt).getTime() + TAG_CHANGE_COOLDOWN_DAYS * 86_400_000 : 0;
  const tagHint = !merchant?.tag
    ? "People can send you money with it instead of your wallet address."
    : nextTagChange > openedAt
      ? `You can change it again on ${new Date(nextTagChange).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.`
      : "People can send you money with it. If you change it, the old one stays reserved for you.";
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
            // An empty email clears the saved one, which turns the notifications off.
            body: {
              name,
              evmAddress: usdt ? evm || null : null,
              ...(withEmail ? { email: email.trim() } : {}),
              // Only when it changed, so saving other fields never runs into the tag's waiting period.
              ...(tagCheck.tag !== merchant?.tag ? { tag: tagCheck.tag } : {}),
            },
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
        <Input
          id="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!tagEdited) setTag(suggestTag(e.target.value));
          }}
          placeholder="e.g. Ada Studio"
          maxLength={80}
          required
        />
      </Field>

      <TagField
        value={tag}
        onChange={(v) => {
          setTag(v);
          setTagEdited(true);
        }}
        status={tagCheck.status}
        message={tagCheck.message}
        hint={tagHint}
      />

      {withEmail && (
        <Field label="Email" htmlFor="email" optional hint="We email you when an invoice is paid. Leave it empty for no emails.">
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            maxLength={254}
          />
        </Field>
      )}

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
      <Button type="submit" block loading={busy} disabled={!name.trim() || tagCheck.status !== "ok"}>
        {submitLabel}
      </Button>
    </form>
  );
}
