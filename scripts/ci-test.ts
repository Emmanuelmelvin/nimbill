// Runs the tests, every one or only those a diff can reach. Used by CI's Tests step and by the
// pre-push hook (scripts/pre-push.ts), so both pick the same tests. Bun's shell runs the same on
// Windows as in CI.
//
//   bun scripts/ci-test.ts            CI: pushes and the merge queue run every test; a pull request
//                                     runs only what its diff reaches, once MERGE_QUEUE=on
//   bun scripts/ci-test.ts --changed  what this branch reaches compared with origin/main (pre-push)
import { $ } from "bun";

// Inputs that bun's import graph can't see, so a change to any of them reruns everything:
//   bun.lock, package.json   a dependency changes what every import resolves to
//   bunfig.toml              test runner settings
//   tsconfig.json            module resolution
//   .github/                 the CI itself
//   mcp/                     the MCP test starts mcp/index.mjs as a child process, not an import
//   tests/memory-db.ts       every database test's setup (imported, listed to be explicit)
const RERUN_ALL = /^(bun\.lock|package\.json|bunfig\.toml|tsconfig\.json|\.github\/|mcp\/|tests\/memory-db\.ts)/;

async function selectedFrom(baseRef: string): Promise<string | null> {
  const base = (await $`git merge-base ${baseRef} HEAD`.text()).trim();
  const changed = (await $`git diff --name-only ${base}`.text()).split("\n").filter(Boolean);
  const all = changed.find((f) => RERUN_ALL.test(f));
  if (all) {
    console.log(`${all} reruns everything: running every test.`);
    return null;
  }
  return base;
}

let base: string | null = null;
if (process.argv.includes("--changed")) {
  base = await selectedFrom("origin/main");
} else if (process.env.GITHUB_EVENT_NAME === "pull_request" && process.env.MERGE_QUEUE === "on") {
  const target = process.env.GITHUB_BASE_REF;
  await $`git fetch --quiet --filter=blob:none origin ${target}`;
  base = await selectedFrom("FETCH_HEAD");
}

if (base) console.log(`Running the tests this diff can reach (the full suite runs before merge).`);
const run = base ? $`bun run test --changed=${base}` : $`bun run test`;
const { exitCode } = await run.nothrow();
process.exit(exitCode);
