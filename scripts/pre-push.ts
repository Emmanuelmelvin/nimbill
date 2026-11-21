// The pre-push hook (hk.pkl): the same checks as CI's "Lint, format and typecheck" job, side by
// side, then the tests this branch can reach (as a pull request runs them). Budget: 9 s.
// The tests run after the checks, not alongside: the database tests are CPU-heavy, and sharing
// the CPU with the type checker pushed one past bun's 5 s per-test limit.
import { $ } from "bun";

const started = performance.now();
const seconds = () => `${((performance.now() - started) / 1000).toFixed(1)} s`;

const checks = {
  lint: $`bun lint`,
  format: $`bun fmt --check`,
  typecheck: $`bun x next typegen && bun check`,
};
const results = await Promise.all(
  Object.entries(checks).map(async ([name, cmd]) => [name, (await cmd.nothrow().quiet()).exitCode] as const),
);
const failed = results.filter(([, code]) => code !== 0).map(([name]) => name);
if (failed.length) {
  console.error(`pre-push: ${failed.join(", ")} failed after ${seconds()}. Run it on its own to see why, e.g. bun lint.`);
  process.exit(1);
}

const tests = await $`bun scripts/ci-test.ts --changed`.nothrow();
console.log(`pre-push checks ${tests.exitCode ? "failed" : "passed"} in ${seconds()}`);
process.exit(tests.exitCode);
