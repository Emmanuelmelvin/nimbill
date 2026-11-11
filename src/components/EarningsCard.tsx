"use client";
import { useMemo, useState } from "react";
import { formatAsset } from "@/lib/currencies";
import {
  RANGES,
  RANGE_NAMES,
  buildSeries,
  changePercent,
  goalProgress,
  inRange,
  splitByAsset,
  topClients,
  type EarningPoint,
  type GoalLike,
  type RangeKey,
} from "@/lib/earnings";
import { formatMoney, toUsd, type Fx, type Unit } from "@/lib/money";
import { Card, Eyebrow, SegmentedControl, cx } from "./ui";

const BAR_GAP: Record<RangeKey, string> = { today: "gap-px", "7d": "gap-2", "30d": "gap-px", "90d": "gap-1", "1y": "gap-1", all: "gap-1" };

/**
 * Earnings over time: a range picker, a unit toggle (your currency / NIM / USDT), bars, and
 * where the money came from. Tap a bar to see that day, week or month.
 */
export function EarningsCard({
  points,
  fx,
  currency,
  goal,
  defaultRange = "30d",
  single,
}: {
  points: EarningPoint[];
  fx: Fx | null;
  /** The merchant's display currency. */
  currency: string;
  /** The running goal, if any: draws the pace needed to reach it. */
  goal?: GoalLike | null;
  defaultRange?: RangeKey;
  /** The payments all come from one client, so there is no "top clients" list to show. */
  single?: boolean;
}) {
  const [range, setRange] = useState<RangeKey>(defaultRange);
  const [unit, setUnit] = useState<Unit>(currency);
  const [picked, setPicked] = useState<number | null>(null);

  const series = useMemo(() => buildSeries(points, range), [points, range]);
  const inPeriod = useMemo(() => inRange(points, series.from, series.to), [points, series]);
  const split = useMemo(() => splitByAsset(inPeriod), [inPeriod]);
  const clients = useMemo(() => topClients(inPeriod), [inPeriod]);
  const money = (usd: number, compact?: boolean) => formatMoney(usd, unit, fx, { compact });

  // Without live rates everything is shown in dollars, so the toggle would do nothing.
  const units = [
    { value: currency, label: currency },
    { value: "NIM", label: "NIM" },
    { value: "USDT", label: "USDT" },
  ];

  // What one bar has to reach, on average, for the goal to be met on time.
  const paceUsd = useMemo(() => {
    if (!goal || range === "today" || range === "all") return null;
    if (goalProgress(goal, points, fx).state !== "active") return null;
    const targetUsd = toUsd(Number(goal.targetAmount), goal.currency, fx);
    return targetUsd === null ? null : (targetUsd / goalProgress(goal, points, fx).daysTotal) * series.bucketDays;
  }, [goal, points, fx, range, series.bucketDays]);

  const max = Math.max(...series.buckets.map((b) => b.usd), paceUsd ?? 0);
  const bucket = picked === null ? null : series.buckets[picked];
  const change = changePercent(series);
  const labels = [series.buckets[0], series.buckets[Math.floor(series.buckets.length / 2)], series.buckets[series.buckets.length - 1]];
  const payments = (n: number) => `${n} ${n === 1 ? "payment" : "payments"}`;

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          label="Period"
          options={RANGES}
          value={range}
          onChange={(r) => {
            setRange(r);
            setPicked(null);
          }}
        />
        {fx && <SegmentedControl label="Show amounts in" kind="radio" options={units} value={unit} onChange={setUnit} />}
      </div>

      <div aria-live="polite">
        <Eyebrow>{bucket ? `${range === "90d" ? "Week of " : ""}${bucket.label}` : `Earned · ${RANGE_NAMES[range]}`}</Eyebrow>
        <p className="mt-1 text-3xl leading-tight font-bold break-words tabular-nums">{money(bucket ? bucket.usd : series.usd)}</p>
        <p className="mt-0.5 text-xs text-muted">
          {bucket ? (
            payments(bucket.count)
          ) : (
            <>
              {payments(series.count)}
              {change !== null && (
                <span className="font-semibold text-ink">
                  {" · "}
                  {change >= 0 ? "▲" : "▼"} {Math.abs(change) >= 1000 ? "999+" : Math.abs(change).toFixed(0)}% vs the period before
                </span>
              )}
              {change === null && series.previousUsd === 0 && series.usd > 0 && " · nothing in the period before"}
            </>
          )}
        </p>
      </div>

      <div>
        <div className="relative h-36">
          {paceUsd !== null && max > 0 && (
            <div
              className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-ink"
              style={{ bottom: `${(paceUsd / max) * 100}%` }}
            >
              <span className="absolute -top-px right-0 -translate-y-full bg-paper pl-1 font-mono text-[10px] font-semibold">
                GOAL PACE {money(paceUsd, true)}
              </span>
            </div>
          )}
          <div className={cx("flex h-full items-end border-b border-ink", BAR_GAP[range])}>
            {series.buckets.map((b, i) => (
              <button
                key={b.start}
                type="button"
                aria-label={`${b.label}: ${money(b.usd)}, ${payments(b.count)}`}
                aria-pressed={picked === i}
                onClick={() => setPicked(picked === i ? null : i)}
                className="relative h-full min-w-0 flex-1 hover:bg-subtle"
              >
                <span
                  className={cx("absolute inset-x-0 bottom-0", picked === null || picked === i ? "bg-ink" : "bg-edge")}
                  style={{ height: b.usd > 0 && max > 0 ? `max(3px, ${(b.usd / max) * 100}%)` : 0 }}
                />
              </button>
            ))}
          </div>
          {series.count === 0 && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-muted">
              {points.length === 0 ? "Your earnings show up here once an invoice is paid." : `No payments ${RANGE_NAMES[range]}.`}
            </p>
          )}
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted">
          {labels.map((b, i) => (
            <span key={i}>{b.label}</span>
          ))}
        </div>
      </div>

      {series.count > 0 && (
        <div className={cx("grid gap-4 border-t border-line pt-4", !single && "min-[420px]:grid-cols-2")}>
          <div>
            <Eyebrow>Paid in</Eyebrow>
            <div className="mt-2 flex h-2 border border-ink" aria-hidden>
              <span className="bg-ink" style={{ width: `${series.usd > 0 ? (split.NIM.usd / series.usd) * 100 : 0}%` }} />
              <span className="flex-1 bg-line" />
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {(["NIM", "USDT"] as const).map((a) => (
                <li key={a} className="flex items-baseline justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className={cx("h-2.5 w-2.5 border border-ink", a === "NIM" ? "bg-ink" : "bg-line")} />
                    {a}
                  </span>
                  <span className="font-mono text-xs tabular-nums">
                    {split[a].count ? formatAsset(split[a].units, a) : "—"}
                    <span className="text-muted"> · {series.usd > 0 ? Math.round((split[a].usd / series.usd) * 100) : 0}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className={cx(single && "hidden")}>
            <Eyebrow>Top clients</Eyebrow>
            <ul className="mt-2 space-y-1 text-sm">
              {clients.map((c) => (
                <li key={c.client} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate">{c.client}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums">{money(c.usd, true)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!fx && <p className="text-xs text-muted">Live rates are unavailable right now, so amounts are shown in US dollars.</p>}
    </Card>
  );
}
