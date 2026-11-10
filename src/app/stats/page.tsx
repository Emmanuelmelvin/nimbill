"use client";
import { useEffect, useState } from "react";
import { Header, Notice, Spinner } from "@/components/ui";
import { api } from "@/lib/client/api";
import { nimExplorerTx, polygonExplorerTx } from "@/lib/client/nimiq";
import { formatAsset, formatFiat } from "@/lib/currencies";

type Stats = {
  invoicesCreated: number;
  groups: { isDemo: boolean; asset: "NIM" | "USDT"; count: number; amount: string }[];
  recent: { number: string; currency: string; total: string; asset: "NIM" | "USDT"; amount: string; txHash: string; paidAt: string; isDemo: boolean }[];
};

/** Public, verifiable usage: every paid invoice links to its on-chain transaction. */
export default function StatsPage() {
  const [s, setS] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Stats>("/api/stats").then(setS).catch((e) => setError(e.message));
  }, []);

  const real = s?.groups.filter((g) => !g.isDemo) ?? [];
  const demo = s?.groups.filter((g) => g.isDemo) ?? [];
  const count = (gs: Stats["groups"]) => gs.reduce((n, g) => n + g.count, 0);
  const vol = (gs: Stats["groups"], a: "NIM" | "USDT") => gs.filter((g) => g.asset === a).reduce((n, g) => n + Number(g.amount), 0);

  return (
    <>
      <Header back="/" />
      <h1 className="mb-1 text-2xl font-bold">NimBill in numbers</h1>
      <p className="mb-4 text-sm text-muted">Every payment below is a public blockchain transaction you can check.</p>
      {error && <Notice kind="error">{error}</Notice>}
      {!s && !error && (
        <div className="flex justify-center py-20 text-navy">
          <Spinner />
        </div>
      )}
      {s && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Tile label="Invoices paid" value={String(count(real))} sub={`${s.invoicesCreated} created`} />
            <Tile label="Sample invoices paid" value={String(count(demo))} sub="by people trying NimBill" />
            <Tile label="NIM received" value={formatAsset(vol(real, "NIM"), "NIM")} />
            <Tile label="USDT received" value={formatAsset(vol(real, "USDT"), "USDT")} />
          </div>
          <section className="card">
            <h2 className="mb-2 font-bold">Latest payments</h2>
            {s.recent.length === 0 && <p className="text-sm text-muted">No payments yet.</p>}
            <ul className="divide-y divide-line">
              {s.recent.map((r) => (
                <li key={r.txHash} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {formatFiat(r.total, r.currency)} {r.isDemo && <span className="ml-1 rounded bg-line px-1.5 text-xs text-muted">sample</span>}
                    </p>
                    <p className="text-xs text-muted">{new Date(r.paidAt).toLocaleString()}</p>
                  </div>
                  <a className="text-right text-xs underline" href={r.asset === "NIM" ? nimExplorerTx(r.txHash) : polygonExplorerTx(r.txHash)} target="_blank" rel="noreferrer">
                    {formatAsset(r.amount, r.asset)} ↗
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}
