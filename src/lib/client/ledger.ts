"use client";
import { useCallback, useEffect, useState } from "react";
import type { EarningPoint } from "@/lib/earnings";
import type { OpenInvoice, PublicGoal } from "@/lib/ledger";
import type { Fx } from "@/lib/money";
import { api } from "./api";

export type { PublicGoal };

/** What /api/earnings returns: payments, what is owed, goals, and the rates to show them with. */
export type Ledger = {
  points: EarningPoint[];
  open: OpenInvoice[];
  goals: PublicGoal[];
  /** Null when live rates are unavailable; totals then fall back to US dollars. */
  fx: Fx | null;
  /** The fiat currency the merchant wants totals in. */
  currency: string;
};

/** The signed-in merchant's earnings data. `reload` refetches after a change (e.g. a goal was saved). */
export function useLedger() {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(
    () =>
      api<Ledger>("/api/earnings")
        .then((l) => {
          setLedger(l);
          setError(null);
        })
        .catch((e) => setError((e as Error).message)),
    [],
  );
  useEffect(() => {
    reload();
  }, [reload]);
  return { ledger, error, reload };
}
