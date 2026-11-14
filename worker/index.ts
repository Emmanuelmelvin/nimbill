// NimBill webhook worker ("Pay with NimBill").
//
// A separate long-running process, hosted apart from the web app (which runs on Vercel). It never
// listens on a port: it only reads the same Postgres database and makes outgoing requests.
//
//   deliver  every 2 s   send queued webhook_events to stores, signed, with retries
//   watch    every 15 s  look on-chain for payments to store invoices nobody is watching
//   sweep    every 60 s  queue webhooks for paid store invoices that are missing one
//
// It runs the app's own code from src/lib (one set of payment rules, one schema), loaded by
// worker/loader.mjs. Start it with `npm run worker`, or `npm run worker -- --once` to run every
// job one time and exit. See worker/README.md.
import { env, isProd } from "../src/lib/env";
import { getDb } from "../src/lib/db";
import { logger } from "../src/lib/logger";
import { deliverDue, sweepMissedEvents } from "../src/lib/webhook-delivery";
import { watchStoreInvoices } from "../src/lib/webhook-watch";

type Job = { name: string; everyMs: number; run: () => Promise<unknown> };

const JOBS: Job[] = [
  // Keep going while a full batch came back, so a backlog drains quickly.
  {
    name: "deliver",
    everyMs: 2_000,
    run: async () => {
      while ((await deliverDue(20)) === 20 && !stopping);
    },
  },
  { name: "watch", everyMs: 15_000, run: watchStoreInvoices },
  { name: "sweep", everyMs: 60_000, run: sweepMissedEvents },
];

let stopping = false;
const running = new Set<Promise<unknown>>();

function checkConfig() {
  const problems: string[] = [];
  if (isProd && !env.DATABASE_URL) problems.push("DATABASE_URL must point to the same Postgres database as the web app.");
  if (isProd && !env.WEBHOOK_KEY_SECRET) problems.push("WEBHOOK_KEY_SECRET must be the same value as on the web app.");
  if (isProd && !env.SITE_URL) problems.push("SITE_URL must be the web app's public address (used for invoice links in webhooks).");
  // The embedded dev database (.data/pglite) must only ever be open in one process: a `next dev`
  // and the worker on it at the same time each keep their own copy and overwrite each other.
  if (!isProd && !env.DATABASE_URL && !process.argv.includes("--embedded-db"))
    problems.push(
      "No DATABASE_URL. Give the web app and the worker the same Postgres DATABASE_URL, or stop `npm run dev` and run `npm run worker -- --embedded-db` to use the embedded database (never both at once).",
    );
  if (problems.length) {
    for (const p of problems) logger.error(`worker config: ${p}`);
    process.exit(1);
  }
}

async function runJob(job: Job) {
  const started = Date.now();
  try {
    await job.run();
  } catch (e) {
    logger.error(`worker: ${job.name} failed`, { error: (e as Error).message });
  }
  return Date.now() - started;
}

function schedule(job: Job) {
  if (stopping) return;
  const p = runJob(job).then((ms) => {
    running.delete(p);
    // Wait the full interval after a run finishes, so a slow run never overlaps the next one.
    if (!stopping) setTimeout(() => schedule(job), Math.max(0, job.everyMs - ms));
  });
  running.add(p);
}

async function main() {
  checkConfig();
  await getDb(); // connects and brings the schema up to date (the same idempotent SQL the app runs)

  if (process.argv.includes("--once")) {
    for (const job of JOBS) {
      const ms = await runJob(job);
      logger.info(`worker: ${job.name} done`, { ms });
    }
    process.exit(0);
  }

  logger.info("worker started", { jobs: JOBS.map((j) => `${j.name}/${j.everyMs / 1000}s`).join(", ") });
  for (const job of JOBS) schedule(job);

  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info("worker stopping", { signal });
    // Let deliveries in flight finish (each is capped at 10 s), then exit.
    await Promise.race([Promise.all(running), new Promise((r) => setTimeout(r, 15_000))]);
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
}

main().catch((e) => {
  logger.error("worker crashed on start", { error: (e as Error).message });
  process.exit(1);
});
