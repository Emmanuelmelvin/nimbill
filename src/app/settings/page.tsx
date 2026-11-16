"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, CodeBlock, CopyButton, Eyebrow, Field, Header, OpenInNimiqPay, PageTitle } from "@/components/ui";
import { CurrencySelect } from "@/components/CurrencySelect";
import { ProfileForm } from "@/components/ProfileForm";
import { WebhooksCard } from "@/components/WebhooksCard";
import { api, type MerchantInfo } from "@/lib/client/api";
import { signOut, useSession } from "@/lib/client/session";
import { toast } from "@/lib/client/toast";
import { formatTag } from "@/lib/tags";

/** The currency totals, the earnings chart and new goals are shown in. Saves as soon as it is picked. */
function DisplayCurrency() {
  const { merchant, setMerchant } = useSession();
  const [busy, setBusy] = useState(false);
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
            try {
              const r = await api<{ merchant: MerchantInfo }>("/api/me", { body: { displayCurrency } });
              setMerchant(r.merchant);
              toast.success(displayCurrency ? `Amounts now shown in ${displayCurrency}` : "Amounts now follow your latest invoice");
            } catch (e) {
              toast.error("Couldn't change the currency", { description: (e as Error).message });
            } finally {
              setBusy(false);
            }
          }}
        />
      </Field>
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
          {merchant.tag && (
            <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
              <div className="min-w-0">
                <Eyebrow>Your tag</Eyebrow>
                <p className="mt-1 truncate font-mono text-base font-semibold">{formatTag(merchant.tag)}</p>
              </div>
              <CopyButton text={formatTag(merchant.tag)} size="sm" className="min-h-11 shrink-0" />
            </div>
          )}
          <Eyebrow>Payments go to</Eyebrow>
          <CodeBlock className="text-sm">{merchant.address}</CodeBlock>
          <CopyButton text={merchant.address} label="Copy address" size="sm" block className="min-h-11" />
        </Card>
        <Card>
          <ProfileForm withEmail />
        </Card>
        <DisplayCurrency />
        {/* Stores create invoices on the merchant's board, which needs a tag. */}
        {merchant.tag && <WebhooksCard />}
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
