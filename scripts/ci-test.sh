#!/usr/bin/env bash
# The Tests step in CI. Pushes and the merge queue run every test. A pull request runs only the
# tests its diff can reach, but only once the merge queue is on (repo variable MERGE_QUEUE=on),
# because until then nothing else runs the full suite before a merge.
set -euo pipefail

# Inputs that bun's import graph can't see, so a change to any of them reruns everything:
#   bun.lock, package.json   a dependency changes what every import resolves to
#   bunfig.toml              test runner settings
#   tsconfig.json            module resolution
#   .github/                 the CI itself
#   mcp/                     the MCP test starts mcp/index.mjs as a child process, not an import
#   tests/memory-db.ts       every database test's setup (imported, listed to be explicit)
RERUN_ALL='^(bun\.lock|package\.json|bunfig\.toml|tsconfig\.json|\.github/|mcp/|tests/memory-db\.ts)'

if [ "${GITHUB_EVENT_NAME:-}" = "pull_request" ] && [ "${MERGE_QUEUE:-}" = "on" ]; then
  git fetch --quiet --filter=blob:none origin "$GITHUB_BASE_REF"
  base=$(git merge-base FETCH_HEAD HEAD)
  if git diff --name-only "$base" HEAD | grep -qE "$RERUN_ALL"; then
    echo "This diff touches an input that reruns everything: running every test."
    exec bun run test
  fi
  echo "Running the tests this diff can reach (the merge queue runs all of them)."
  exec bun run test --changed="$base"
fi

exec bun run test
