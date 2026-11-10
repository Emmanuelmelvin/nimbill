"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Header, Notice, OpenInNimiqPay, Spinner, StatusBadge } from "@/components/ui";
import { ProfileForm } from "@/components/ProfileForm";
import { StakeCard } from "@/components/StakeCard";
import { api, type PublicInvoice } from "@/lib/client/api";
import { useNimiq } from "@/lib/client/nimiq";
import { useSession, useSignIn } from "@/lib/client/session";
import { formatAsset, formatFiat } from "@/lib/currencies";

export default function Home() {
  const { merchant, loading } = useSession();
  return (
    <>
      <Header />
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-24 text-navy">
          <Spinner />
        </div>
      ) : !merchant ? (
        <Landing />
      ) : !merchant.name ? (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Welcome! One quick step</h1>
          <p className="text-muted">This is how your name appears on invoices and receipts.</p>
          <div className="card">
            <ProfileForm submitLabel="Continue" />
          </div>
        </div>
      ) : (
        <Dashboard />
      )}
    </>
  );
}

function TryDemo({ className = "btn-ghost w-full" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const { invoice } = await api<{ invoice: PublicInvoice }>("/api/demo", { method: "POST" });
            router.push(`/i/${invoice.id}`);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? <Spinner /> : "Try it: pay a sample invoice (≈ $0.05)"}
      </button>
      {error && <Notice kind="error">{error}</Notice>}
    </>
  );
}

function Landing() {
  return (
    <div className="space-y-6 pt-4">
      <section>
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">
          Invoice in your currency.
          <br />
          <span className="text-gold-dark">Get paid in NIM or USDT.</span>
        </h1>
        <p className="mt-2 text-muted">For freelancers and small businesses. Send a link — your client pays from their wallet, straight into yours.</p>
      </section>

      <CallToAction />

      <ul className="card space-y-4">
        {[
          ["₦", "Price in Naira, Shillings, Euros…", "Clients pay the exact amount at a live rate, locked for 5 minutes."],
          ["✓", "Verified on the blockchain", "An invoice is marked paid only after we see the payment on-chain."],
          ["⚡", "No middleman, no account for clients", "Money goes wallet-to-wallet. We never hold your funds."],
          ["%", "Grow what you earn", "Stake your NIM earnings with one tap, right after you get paid."],
        ].map(([icon, title, text]) => (
          <li key={title} className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 font-bold text-gold-dark">{icon}</span>
            <div>
              <p className="font-semibold">{title}</p>
              <p className="text-sm text-muted">{text}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-center text-sm">
        <Link href="/stats" className="text-muted underline">
          See payments made with NimBill
        </Link>
      </p>
    </div>
  );
}

function CallToAction() {
  const { state } = useNimiq();
  const { signIn, busy, error } = useSignIn();
  return (
    <div className="space-y-3">
      {state === "checking" ? (
        <div className="flex justify-center py-3 text-navy">
          <Spinner />
        </div>
      ) : state === "ready" ? (
        <>
          <button className="btn-primary w-full" disabled={busy} onClick={signIn}>
            {busy ? <Spinner /> : "Start invoicing — sign in with Nimiq Pay"}
          </button>
          <p className="text-center text-xs text-muted">Signing a message proves the wallet is yours. It costs nothing.</p>
          {error && <Notice kind="error">{error}</Notice>}
        </>
      ) : (
        <OpenInNimiqPay text="NimBill is a Nimiq Pay Mini App. Open it in Nimiq Pay to create invoices and pay them." />
      )}
      <TryDemo />
    </div>
  );
}

function Dashboard() {
  const [invoices, setInvoices] = useState<PublicInvoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unpaid" | "paid">("all");

  useEffect(() => {
    api<{ invoices: PublicInvoice[] }>("/api/invoices")
      .then((r) => setInvoices(r.invoices))
      .catch((e) => setError(e.message));
  }, []);

  const summary = useMemo(() => {
    const list = invoices ?? [];
    const paid = list.filter((i) => i.status === "paid");
    const open = list.filter((i) => i.status === "unpaid");
    const sumBy = (arr: PublicInvoice[]) => {
      const m = new Map<string, number>();
      arr.forEach((i) => m.set(i.currency, (m.get(i.currency) ?? 0) + Number(i.total)));
      return [...m.entries()].map(([c, v]) => formatFiat(v, c)).join(" + ") || formatFiat(0, "USD");
    };
    const nimEarned = paid.filter((i) => i.payment?.asset === "NIM").reduce((s, i) => s + Number(i.payment!.amount), 0);
    return { paidCount: paid.length, openCount: open.length, paidSum: sumBy(paid), openSum: sumBy(open), nimEarned };
  }, [invoices]);

  const shown = (invoices ?? []).filter((i) => filter === "all" || i.status === filter);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Paid</p>
          <p className="mt-1 text-lg leading-tight font-bold break-words">{summary.paidSum}</p>
          <p className="text-xs text-muted">
            {summary.paidCount} {summary.paidCount === 1 ? "invoice" : "invoices"}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Outstanding</p>
          <p className="mt-1 text-lg leading-tight font-bold break-words">{summary.openSum}</p>
          <p className="text-xs text-muted">
            {summary.openCount} {summary.openCount === 1 ? "invoice" : "invoices"}
          </p>
        </div>
      </div>

      <Link href="/new" className="btn-primary w-full text-lg">
        + New invoice
      </Link>

      {summary.nimEarned > 0 && <StakeCard suggestedLuna={summary.nimEarned} />}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Invoices</h2>
          <div className="flex rounded-xl bg-white p-1 text-sm shadow-sm" role="tablist">
            {(["all", "unpaid", "paid"] as const).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={`min-h-9 rounded-lg px-3 font-medium capitalize ${filter === f ? "bg-navy text-white" : "text-muted"}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {error && <Notice kind="error">{error}</Notice>}
        {!invoices && !error && (
          <div className="flex justify-center py-10 text-navy">
            <Spinner />
          </div>
        )}
        {invoices && invoices.length === 0 && (
          <div className="card text-center">
            <p className="font-semibold">No invoices yet</p>
            <p className="mt-1 text-sm text-muted">Create your first one — it takes under a minute.</p>
          </div>
        )}
        {invoices && invoices.length > 0 && shown.length === 0 && <p className="py-6 text-center text-sm text-muted">Nothing here.</p>}
        <ul className="space-y-2">
          {shown.map((inv) => (
            <li key={inv.id}>
              <Link href={`/i/${inv.id}`} className="card flex items-center justify-between gap-3 p-4 hover:ring-2 hover:ring-gold/40">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{inv.clientName}</p>
                  <p className="text-xs text-muted">
                    {inv.number} · {new Date(inv.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold">{formatFiat(inv.total, inv.currency)}</p>
                  {inv.payment ? (
                    <p className="text-xs text-ok">{formatAsset(inv.payment.amount, inv.payment.asset as "NIM" | "USDT")}</p>
                  ) : (
                    <StatusBadge status={inv.status} dueDate={inv.dueDate} />
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
