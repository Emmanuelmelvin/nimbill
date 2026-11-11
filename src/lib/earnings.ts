// Earnings maths shared by the dashboard chart, goals and the tests: pure functions, no I/O.
// All grouping uses the viewer's local time zone, so "today" means their today.
import { fromUsd, type Fx } from "./money";

/** One verified payment. `usd` is its dollar value when it was verified. */
export type EarningPoint = {
  at: string; // ISO time the payment landed
  usd: number;
  asset: "NIM" | "USDT";
  amount: string; // smallest units actually received
  client: string;
};

export const RANGES = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "All" },
] as const;
export type RangeKey = (typeof RANGES)[number]["value"];

export const RANGE_NAMES: Record<RangeKey, string> = {
  today: "today",
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 13 weeks",
  "1y": "last 12 months",
  all: "all time",
};

export type Bucket = { start: number; end: number; label: string; usd: number; count: number };
export type Series = {
  buckets: Bucket[];
  /** Start (inclusive) and end (exclusive) of the whole range, ms. */
  from: number;
  to: number;
  usd: number;
  count: number;
  /** Earnings in the period of the same length right before this one; null for "all". */
  previousUsd: number | null;
  /** Days each bucket covers (a fraction for hours, ~30 for months). */
  bucketDays: number;
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

/** "YYYY-MM-DD" in local time. */
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Local midnight at the start of a "YYYY-MM-DD" day. */
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const hourLabel = (d: Date) => {
  const h = d.getHours();
  return h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
};
const dayLabel = (d: Date) => d.toLocaleDateString("en", { day: "numeric", month: "short" });
const monthLabel = (d: Date, withYear: boolean) =>
  d.toLocaleDateString("en", withYear ? { month: "short", year: "2-digit" } : { month: "short" });

/** Bucket edges for a range: n+1 dates for n buckets. */
function edges(range: RangeKey, now: Date, firstAt: number | null): { at: Date[]; label: (d: Date) => string; bucketDays: number } {
  const today = startOfDay(now);
  if (range === "today") {
    const at = Array.from({ length: 25 }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), i));
    return { at, label: hourLabel, bucketDays: 1 / 24 };
  }
  if (range === "7d" || range === "30d") {
    const n = range === "7d" ? 7 : 30;
    return { at: Array.from({ length: n + 1 }, (_, i) => addDays(today, i - n + 1)), label: dayLabel, bucketDays: 1 };
  }
  if (range === "90d") {
    return { at: Array.from({ length: 14 }, (_, i) => addDays(today, (i - 13) * 7 + 1)), label: dayLabel, bucketDays: 7 };
  }
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  if (range === "1y") {
    return { at: Array.from({ length: 13 }, (_, i) => addMonths(thisMonth, i - 11)), label: (d) => monthLabel(d, false), bucketDays: 30.4 };
  }
  // All time: one bar per month from the first payment, never fewer than six.
  const first = firstAt === null ? thisMonth : new Date(new Date(firstAt).getFullYear(), new Date(firstAt).getMonth(), 1);
  const months = Math.max(6, (thisMonth.getFullYear() - first.getFullYear()) * 12 + thisMonth.getMonth() - first.getMonth() + 1);
  return {
    at: Array.from({ length: months + 1 }, (_, i) => addMonths(thisMonth, i - months + 1)),
    label: (d) => monthLabel(d, true),
    bucketDays: 30.4,
  };
}

/** Group payments into the bars of a chart for `range`. */
export function buildSeries(points: EarningPoint[], range: RangeKey, now = new Date()): Series {
  const times = points.map((p) => Date.parse(p.at));
  const firstAt = times.length ? Math.min(...times) : null;
  const { at, label, bucketDays } = edges(range, now, firstAt);
  const buckets: Bucket[] = at
    .slice(0, -1)
    .map((d, i) => ({ start: d.getTime(), end: at[i + 1].getTime(), label: label(d), usd: 0, count: 0 }));
  const from = buckets[0].start;
  const to = buckets[buckets.length - 1].end;

  // The period of equal length just before. Calendar-aware for months.
  let prevFrom: number | null = null;
  if (range === "1y") prevFrom = addMonths(at[0], -12).getTime();
  else if (range !== "all") prevFrom = addDays(at[0], -Math.round((to - from) / 86_400_000)).getTime();

  let usd = 0;
  let count = 0;
  let previousUsd = 0;
  points.forEach((p, i) => {
    const t = times[i];
    if (t >= from && t < to) {
      // Buckets are contiguous and sorted; a linear scan is fine for a dashboard's worth of bars.
      const b = buckets.find((x) => t >= x.start && t < x.end);
      if (b) {
        b.usd += p.usd;
        b.count += 1;
      }
      usd += p.usd;
      count += 1;
    } else if (prevFrom !== null && t >= prevFrom && t < from) {
      previousUsd += p.usd;
    }
  });
  return { buckets, from, to, usd, count, previousUsd: prevFrom === null ? null : previousUsd, bucketDays };
}

/** Percent change against the previous period; null when there is nothing to compare with. */
export function changePercent(s: Series): number | null {
  if (s.previousUsd === null || s.previousUsd <= 0) return null;
  return ((s.usd - s.previousUsd) / s.previousUsd) * 100;
}

export const inRange = (points: EarningPoint[], from: number, to: number) =>
  points.filter((p) => {
    const t = Date.parse(p.at);
    return t >= from && t < to;
  });

/** What was actually received in each coin, with its dollar value. */
export function splitByAsset(points: EarningPoint[]) {
  const out = { NIM: { usd: 0, units: 0, count: 0 }, USDT: { usd: 0, units: 0, count: 0 } };
  for (const p of points) {
    out[p.asset].usd += p.usd;
    out[p.asset].units += Number(p.amount);
    out[p.asset].count += 1;
  }
  return out;
}

/** Clients who paid the most, biggest first. Names are matched ignoring case and spacing. */
export function topClients(points: EarningPoint[], limit = 3) {
  const m = new Map<string, { client: string; usd: number; count: number }>();
  for (const p of points) {
    const key = p.client.trim().toLowerCase();
    const c = m.get(key) ?? { client: p.client.trim(), usd: 0, count: 0 };
    c.usd += p.usd;
    c.count += 1;
    m.set(key, c);
  }
  return [...m.values()].sort((a, b) => b.usd - a.usd).slice(0, limit);
}

// ---------- goals ----------

export type GoalLike = { targetAmount: string; currency: string; startDate: string; endDate: string };

export type GoalProgress = {
  state: "upcoming" | "active" | "ended";
  target: number;
  /** Earned inside the goal's dates, in the goal's currency. Null when no rate is available. */
  earned: number | null;
  /** 0–1, capped. */
  fraction: number;
  reached: boolean;
  daysTotal: number;
  /** Days left including today; 0 once the goal has ended. */
  daysLeft: number;
  /** What still has to come in per remaining day, in the goal's currency. */
  perDayNeeded: number | null;
  /** Earned at least what a steady pace would have brought in by today. */
  onTrack: boolean;
};

const DAY_MS = 86_400_000;
const dayDiff = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);

export function goalProgress(goal: GoalLike, points: EarningPoint[], fx: Fx | null, now = new Date()): GoalProgress {
  const start = parseLocalDate(goal.startDate);
  const end = parseLocalDate(goal.endDate);
  const endExclusive = addDays(end, 1);
  const today = startOfDay(now);
  const target = Number(goal.targetAmount);
  const earnedUsd = inRange(points, start.getTime(), endExclusive.getTime()).reduce((s, p) => s + p.usd, 0);
  const earned = fromUsd(earnedUsd, goal.currency, fx);
  const daysTotal = dayDiff(start, end) + 1;
  const state = today < start ? "upcoming" : today > end ? "ended" : "active";
  const daysLeft = state === "ended" ? 0 : state === "upcoming" ? daysTotal : dayDiff(today, end) + 1;
  const got = earned ?? 0;
  const reached = target > 0 && got >= target;
  // By the end of today a steady pace would have covered this share of the goal.
  const elapsed = state === "active" ? dayDiff(start, today) + 1 : state === "ended" ? daysTotal : 0;
  const expected = (target * elapsed) / daysTotal;
  return {
    state,
    target,
    earned,
    fraction: target > 0 ? Math.min(1, got / target) : 0,
    reached,
    daysTotal,
    daysLeft,
    perDayNeeded: earned === null || reached || daysLeft === 0 ? null : (target - got) / daysLeft,
    // A little slack: being 5% behind a straight line is not worth a warning.
    onTrack: reached || got >= expected * 0.95,
  };
}
