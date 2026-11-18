"use client";
import { useEffect, useState } from "react";
import { Alert, AnchorButton, Badge, Button, Card, CardHeader, Dropdown, Field, Loader } from "@/components/ui";
import { api } from "@/lib/client/api";
import { openInNimiqPayLink } from "@/lib/client/nimiq";
import { toast } from "@/lib/client/toast";
import { AppError } from "@/lib/errors";
import { MONTHLY_AMOUNTS, PAYOUT_METHODS, WAITLIST_COUNTRIES, type WaitlistBody } from "@/lib/withdraw/schemas";

// "Bank and mobile money": not built yet. Collects a waitlist (demand data for choosing the first
// fiat partner) and points to partner Mini Apps that already cash out NIM today.

/** Partner Mini Apps inside Nimiq Pay. `url` is the Mini App's address; null until we have it. */
const PARTNERS: { name: string; description: string; url: string | null }[] = [
  { name: "AbaPay", description: "Bills, airtime, data and bank transfers in Nigeria.", url: null },
  { name: "NimPoint", description: "NIM to Naira, to your bank or through a cash agent.", url: null },
];

type Entry = WaitlistBody & { createdAt: string };

export function FiatWithdraw() {
  const [entry, setEntry] = useState<Entry | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<WaitlistBody>>({ country: "NG" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ entry: Entry | null }>("/api/withdraw/waitlist")
      .then((r) => {
        setEntry(r.entry);
        if (r.entry) setForm(r.entry);
      })
      .catch(() => setEntry(null));
  }, []);

  const join = async () => {
    if (!form.country || !form.method || !form.monthly) return setError("Fill in all three to join.");
    setSaving(true);
    setError(null);
    try {
      const r = await api<{ entry: Entry }>("/api/withdraw/waitlist", { method: "POST", body: form });
      setEntry(r.entry);
      setEditing(false);
      toast.success(entry ? "Waitlist answers updated" : "You're on the waitlist");
    } catch (e) {
      setError(AppError.is(e) ? e.publicMessage : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const label = <T extends readonly { value: string; label: string }[]>(list: T, v?: string) =>
    list.find((o) => o.value === v)?.label ?? "";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon="₦"
          title="Cash out to your bank or mobile money"
          description="Turn your NIM or USDT into local money. Starting with Nigeria."
          action={<Badge variant="muted">Coming soon</Badge>}
        />
        {entry === undefined ? (
          <Loader compact />
        ) : entry && !editing ? (
          <div className="mt-4">
            <Alert kind="success" title="You're on the waitlist">
              {label(WAITLIST_COUNTRIES, entry.country)} · {label(PAYOUT_METHODS, entry.method)} · {label(MONTHLY_AMOUNTS, entry.monthly)} a
              month. We&apos;ll let you know when it opens.
            </Alert>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setEditing(true)}>
              Change my answers
            </Button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <p className="text-sm">
              Join the waitlist and tell us how you&apos;d like to be paid. It helps us pick the first licensed payout partner (NimBill is a non-custodial interface and never holds or converts fiat itself).
            </p>
            <Field label="Country" htmlFor="waitlist-country">
              <Dropdown
                id="waitlist-country"
                labels="name"
                value={form.country ?? "NG"}
                onChange={(v) => setForm((f) => ({ ...f, country: v }))}
                options={WAITLIST_COUNTRIES}
              />
            </Field>
            <Field label="Paid to" htmlFor="waitlist-method">
              <Dropdown
                id="waitlist-method"
                labels="name"
                placeholder="Pick one"
                value={form.method ?? ("" as WaitlistBody["method"])}
                onChange={(v) => setForm((f) => ({ ...f, method: v }))}
                options={PAYOUT_METHODS}
              />
            </Field>
            <Field label="About how much a month" htmlFor="waitlist-monthly">
              <Dropdown
                id="waitlist-monthly"
                labels="name"
                placeholder="Pick one"
                value={form.monthly ?? ("" as WaitlistBody["monthly"])}
                onChange={(v) => setForm((f) => ({ ...f, monthly: v }))}
                options={MONTHLY_AMOUNTS}
              />
            </Field>
            {error && <Alert kind="error">{error}</Alert>}
            <Button block loading={saving} disabled={saving} onClick={join}>
              {entry ? "Save my answers" : "Join the waitlist"}
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-bold">Use a partner today</h2>
        <p className="mt-1 text-sm text-muted">These Mini Apps in Nimiq Pay already turn NIM into Naira.</p>
        <ul className="mt-4 space-y-3">
          {PARTNERS.map((p) => (
            <li key={p.name} className="flex items-center gap-3 border border-line p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-muted">{p.description}</p>
              </div>
              {p.url ? (
                <AnchorButton variant="secondary" size="sm" href={openInNimiqPayLink(p.url)}>
                  Open
                </AnchorButton>
              ) : (
                <Badge variant="muted">Link soon</Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
