// The Budgets job in CI: reads this run's job timings from the GitHub API. A job that runs longer
// than its budget fails CI. Waiting and setup over budget are warnings for now: on GitHub's shared
// runners they swing from run to run with no code change (the same commit set up in 7 s, then 16 s),
// so failing on them would be noise. Set the repo variable ENFORCE_SETUP_BUDGETS=on once CI runs on
// warm machines, and they fail CI again. Step budgets (lint, format, typecheck, tests) are enforced
// inside the jobs with `timeout`.
// Run by CI with GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT set.
import { appendFileSync } from "node:fs";

const BUDGET = { waiting: 5, setup: 15, job: 35 }; // seconds
const ENFORCED: (keyof typeof BUDGET)[] = process.env.ENFORCE_SETUP_BUDGETS === "on" ? ["waiting", "setup", "job"] : ["job"];
const SETUP_STEP = /^(Set up job|Run actions\/checkout|Run oven-sh\/setup-bun|Run actions\/setup-node|Run actions\/cache|Run bun install)/;

type Step = { name: string; started_at: string | null; completed_at: string | null };
type Job = { name: string; created_at: string; started_at: string; completed_at: string | null; conclusion: string | null; steps: Step[] };

const { GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT = "1", GITHUB_STEP_SUMMARY } = process.env;
const res = await fetch(
  `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/attempts/${GITHUB_RUN_ATTEMPT}/jobs?per_page=100`,
  {
    headers: { authorization: `Bearer ${GITHUB_TOKEN}`, accept: "application/vnd.github+json" },
  },
);
if (!res.ok) throw new Error(`GitHub API: ${res.status} ${await res.text()}`);
const { jobs } = (await res.json()) as { jobs: Job[] };

const secs = (from: string | null, to: string | null) => (from && to ? (Date.parse(to) - Date.parse(from)) / 1000 : 0);
const rows: string[] = [];
const over: string[] = [];
const warned: string[] = [];
for (const job of jobs) {
  if (!job.completed_at || job.conclusion === "skipped" || job.name === "Budgets" || job.name === "CI") continue;
  const waiting = secs(job.created_at, job.started_at);
  const setup = job.steps.filter((s) => SETUP_STEP.test(s.name)).reduce((t, s) => t + secs(s.started_at, s.completed_at), 0);
  const total = secs(job.started_at, job.completed_at);
  const check = (what: keyof typeof BUDGET, value: number) => {
    if (value <= BUDGET[what]) return `${value}s`;
    const line = `${job.name}: ${what} ${value}s, budget ${BUDGET[what]}s`;
    if (ENFORCED.includes(what)) {
      over.push(line);
      return `${value}s ❌`;
    }
    warned.push(line);
    return `${value}s ⚠️`;
  };
  rows.push(`| ${job.name} | ${check("waiting", waiting)} | ${check("setup", setup)} | ${check("job", total)} |`);
}

const table = [
  `| job | waiting (≤${BUDGET.waiting}s) | setup (≤${BUDGET.setup}s) | whole job (≤${BUDGET.job}s) |`,
  "|---|---|---|---|",
  ...rows,
].join("\n");
console.log(table);
if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `## CI budgets\n\n${table}\n\n❌ fails CI, ⚠️ warning only\n`);
// Warnings show on the run's summary page without failing it.
for (const w of warned) console.log(`::warning title=Over budget (warning only)::${w}`);
if (over.length) {
  console.error(`\nOver budget:\n${over.map((o) => `- ${o}`).join("\n")}`);
  process.exit(1);
}
