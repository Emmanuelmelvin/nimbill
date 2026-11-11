// Unit checks for the earnings maths (chart buckets, comparison, goals). Run: npm run test:earnings
import { buildSeries, changePercent, goalProgress, localDate, splitByAsset, topClients, type EarningPoint } from "../src/lib/earnings.ts";
import { formatMoney, fromUsd, toUsd, type Fx } from "../src/lib/money.ts";

let failed = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) failed++;
};
const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-6;

// Wednesday 11 Nov 2026, 15:30 local time.
const now = new Date(2026, 10, 11, 15, 30);
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
const pt = (iso: string, usd: number, asset: "NIM" | "USDT" = "NIM", client = "Acme"): EarningPoint => ({
  at: iso,
  usd,
  asset,
  amount: asset === "NIM" ? String(usd * 1000 * 1e5) : String(usd * 1e6),
  client,
});
const points = [
  pt(at(2025, 12, 20), 500, "USDT", "Old Co"),
  pt(at(2026, 9, 1), 40),
  pt(at(2026, 10, 30), 70, "USDT", "Beta"),
  pt(at(2026, 11, 2), 30),
  pt(at(2026, 11, 5), 100, "USDT", "acme "),
  pt(at(2026, 11, 10, 9), 20, "NIM", "Beta"),
  pt(at(2026, 11, 11, 8), 10),
  pt(at(2026, 11, 11, 14), 15, "USDT", "Beta"),
];

let s = buildSeries(points, "today", now);
ok(s.buckets.length === 24 && s.usd === 25 && s.count === 2, "today: 24 hourly bars, 2 payments worth 25");
ok(s.buckets[8].usd === 10 && s.buckets[14].usd === 15, "today: payments land in the 8am and 2pm bars");
ok(s.previousUsd === 20, "today compares with yesterday (20)");
ok(near(changePercent(s), 25), "today is up 25% on yesterday");

s = buildSeries(points, "7d", now);
ok(s.buckets.length === 7 && s.usd === 145, `7d: 7 daily bars, total ${s.usd}`);
ok(s.buckets[6].usd === 25 && s.buckets[0].usd === 100, "7d: last bar is today, first bar is 5 Nov");
ok(s.previousUsd === 100, `7d: previous week (29 Oct – 4 Nov) = ${s.previousUsd}`);

s = buildSeries(points, "30d", now);
ok(s.buckets.length === 30 && s.usd === 245 && s.count === 6, `30d: total ${s.usd} from ${s.count} payments`);
ok(new Date(s.from).getDate() === 13 && new Date(s.from).getMonth() === 9, "30d starts on 13 Oct");

s = buildSeries(points, "90d", now);
ok(s.buckets.length === 13 && s.bucketDays === 7 && s.usd === 285, `90d: 13 weekly bars, total ${s.usd}`);
ok(s.buckets[12].usd === 145 && s.buckets[11].usd === 100, "90d: last two weeks split correctly");

s = buildSeries(points, "1y", now);
ok(s.buckets.length === 12 && s.usd === 785, `1y: 12 monthly bars, total ${s.usd}`);
ok(s.buckets[11].usd === 175 && s.buckets[0].usd === 500 && s.buckets[0].label === "Dec", "1y: Dec 2025 first, Nov 2026 last");
ok(s.previousUsd === 0 && changePercent(s) === null, "1y: nothing before, so no percentage");

s = buildSeries(points, "all", now);
ok(s.buckets.length === 12 && s.previousUsd === null && s.usd === 785, "all: from the first payment's month, no comparison");
ok(buildSeries([], "all", now).buckets.length === 6, "all with no payments still draws six months");

const split = splitByAsset(points);
ok(split.NIM.count === 4 && split.USDT.usd === 685, "split by coin");
const top = topClients(points, 2);
ok(
  top[0].client === "Old Co" && top[1].client === "Acme" && top[1].usd === 180 && top[1].count === 4,
  "top clients ignore case and spacing",
);

const fx: Fx = { nimUsd: 0.001, usdtUsd: 1, perUsd: { USD: 1, NGN: 1500 } };
ok(near(fromUsd(10, "NGN", fx), 15000) && near(fromUsd(10, "NIM", fx), 10000) && fromUsd(10, "KES", fx) === null, "fromUsd");
ok(near(toUsd(15000, "NGN", fx), 10) && near(toUsd(5000, "NIM", fx), 5) && toUsd(1, "NGN", null) === null, "toUsd");
ok(formatMoney(10, "NGN", fx) === "₦15,000.00" && formatMoney(10, "NIM", fx) === "10,000 NIM", "formatMoney");
ok(formatMoney(10, "NGN", null) === "$10.00", "formatMoney falls back to dollars without rates");

// November goal of ₦450,000 (= $300). Earned in November so far: 175.
const goal = { targetAmount: "450000", currency: "NGN", startDate: "2026-11-01", endDate: "2026-11-30" };
let g = goalProgress(goal, points, fx, now);
ok(g.state === "active" && near(g.earned, 262500) && near(g.fraction, 175 / 300), `goal: earned ${g.earned} of ${g.target}`);
ok(g.daysTotal === 30 && g.daysLeft === 20, `goal: ${g.daysLeft} of ${g.daysTotal} days left`);
ok(near(g.perDayNeeded, 187500 / 20), `goal: needs ${g.perDayNeeded} a day`);
ok(g.onTrack && !g.reached, "goal: ahead of a steady pace (11/30 of 300 = 110)");
g = goalProgress({ ...goal, targetAmount: "1500000" }, points, fx, now);
ok(!g.onTrack, "a bigger goal is behind");
g = goalProgress({ ...goal, targetAmount: "150000" }, points, fx, now);
ok(g.reached && g.fraction === 1 && g.perDayNeeded === null, "a smaller goal is reached and capped at 100%");
g = goalProgress({ ...goal, startDate: "2026-10-01", endDate: "2026-10-31" }, points, fx, now);
ok(g.state === "ended" && g.daysLeft === 0 && near(g.earned, 105000) && !g.reached, "October goal ended short");
g = goalProgress({ ...goal, startDate: "2026-12-01", endDate: "2026-12-31" }, points, fx, now);
ok(g.state === "upcoming" && g.daysLeft === 31 && g.earned === 0, "December goal has not started");
ok(goalProgress(goal, points, null, now).earned === null, "no rates: progress unknown rather than wrong");
ok(localDate(now) === "2026-11-11", "localDate");

process.exit(failed ? 1 : 0);
