"use client";
import { useEffect, useState } from "react";
import { Alert, Badge, Card, CardHeader, Header, Loader, PageTitle, Stat } from "@/components/ui";
import { api } from "@/lib/client/api";
import { nimExplorerTx, polygonExplorerTx } from "@/lib/client/nimiq";
import { formatAsset, formatFiat } from "@/lib/currencies";

type Stats = {
  invoicesCreated: number;
  groups: { isDemo: boolean; asset: "NIM" | "USDT"; count: number; amount: string }[];
  recent: {
    number: string;
    currency: string;
    total: string;
    asset: "NIM" | "USDT";
    amount: string;
    txHash: string;
    paidAt: string;
    isDemo: boolean;
  }[];
};

/** Public, verifiable usage: every paid invoice links to its on-chain transaction. */
export default function StatsPage() {
  const [s, setS] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Stats>("/api/stats")
      .then(setS)
      .catch((e) => setError(e.message));
  }, []);

  const real = s?.groups.filter((g) => !g.isDemo) ?? [];
  const demo = s?.groups.filter((g) => g.isDemo) ?? [];
  const count = (gs: Stats["groups"]) => gs.reduce((n, g) => n + g.count, 0);
  const vol = (gs: Stats["groups"], a: "NIM" | "USDT") => gs.filter((g) => g.asset === a).reduce((n, g) => n + Number(g.amount), 0);

  return (
    <>
      <Header back="/" />
      <PageTitle title="NimBill in numbers" description="Every payment below is a public blockchain transaction you can check." />
      {error && <Alert kind="error">{error}</Alert>}
      {!s && !error && <Loader />}
      {s && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Invoices paid" value={String(count(real))} sub={`${s.invoicesCreated} created`} />
            <Stat label="Sample invoices paid" value={String(count(demo))} sub="by people trying NimBill" />
            <Stat label="NIM received" value={formatAsset(vol(real, "NIM"), "NIM")} />
            <Stat label="USDT received" value={formatAsset(vol(real, "USDT"), "USDT")} />
          </div>
          <Card padding="none">
            <CardHeader title="Latest payments" className="border-b border-line p-4" />
            {s.recent.length === 0 && <p className="p-4 text-sm text-muted">No payments yet.</p>}
            <ul className="divide-y divide-line">
              {s.recent.map((r) => (
                <li key={r.txHash} className="flex items-center justify-between gap-3 p-4 text-sm">
                  <div>
                    <p className="flex items-center gap-2 font-medium tabular-nums">
                      {formatFiat(r.total, r.currency)} {r.isDemo && <Badge variant="muted">Sample</Badge>}
                    </p>
                    <p className="text-xs text-muted">{new Date(r.paidAt).toLocaleString()}</p>
                  </div>
                  <a
                    className="text-right font-mono text-xs underline decoration-1 underline-offset-4 hover:decoration-2"
                    href={r.asset === "NIM" ? nimExplorerTx(r.txHash) : polygonExplorerTx(r.txHash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {formatAsset(r.amount, r.asset)} ↗
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
