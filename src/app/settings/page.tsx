"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, CodeBlock, CopyButton, Eyebrow, Field, Header, OpenInNimiqPay, PageTitle } from "@/components/ui";
import { CurrencySelect } from "@/components/CurrencySelect";
import { ProfileForm } from "@/components/ProfileForm";
import { api, type MerchantInfo } from "@/lib/client/api";
import { signOut, useSession } from "@/lib/client/session";

/** The currency totals, the earnings chart and new goals are shown in. Saves as soon as it is picked. */
function DisplayCurrency() {
  const { merchant, setMerchant } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!merchant) return null;
  return (
    <Card className="space-y-3">
      <Field
        label="Show amounts in"
        htmlFor="display-currency"
        hint={
          merchant.displayCurrency
            ? "Your earnings and totals are shown in this currency, at today's rate."
            : "Not set: totals follow the currency of your latest invoice."
        }
      >
        <CurrencySelect
          id="display-currency"
          value={merchant.displayCurrency ?? ""}
          placeholder="Same as my latest invoice"
          onChange={async (displayCurrency) => {
            if (busy) return;
            setBusy(true);
            setError(null);
            try {
              const r = await api<{ merchant: MerchantInfo }>("/api/me", { body: { displayCurrency } });
              setMerchant(r.merchant);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </Field>
      {error && <Alert kind="error">{error}</Alert>}
    </Card>
  );
}

export default function Settings() {
  const router = useRouter();
  const { merchant, loading } = useSession();
  if (loading) return <Header back="/" />;
  if (!merchant) {
    return (
      <>
        <Header back="/" />
        <OpenInNimiqPay text="Sign in with Nimiq Pay to manage your settings." />
      </>
    );
  }
  return (
    <>
      <Header back="/" />
      <PageTitle title="Settings" />
      <div className="space-y-4">
        <Card className="space-y-3">
          <Eyebrow>Payments go to</Eyebrow>
          <CodeBlock className="text-sm">{merchant.address}</CodeBlock>
          <CopyButton text={merchant.address} label="Copy address" size="sm" block className="min-h-11" />
        </Card>
        <Card>
          <ProfileForm withEmail />
        </Card>
        <DisplayCurrency />
        <Button
          variant="danger"
          block
          onClick={async () => {
            await signOut();
            router.replace("/");
          }}
        >
          Sign out
        </Button>
      </div>
    </>
  );
}
