#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cd "$ROOT_DIR"

cat >"$TMP_DIR/unsafe-body.md" <<'BODY'
Summary\n- This was accidentally passed as an escaped inline body.
BODY

cat >"$TMP_DIR/reviewable-body.md" <<'BODY'
## Summary
- Adds a fixture-backed demo for the PR body guard.

## Verification
- agent-qc file-body accepts this markdown body.

## Risk Level
- Low; this demo only creates files in a temporary directory.

## Rollback Plan
- Revert the demo update.
BODY

echo "== unsafe body should fail =="
if node src/index.js file-body --path "$TMP_DIR/unsafe-body.md"; then
  echo "expected unsafe body to fail" >&2
  exit 1
fi

echo
echo "== reviewable body should pass =="
node src/index.js file-body --path "$TMP_DIR/reviewable-body.md"

echo
echo "== unsafe gh command should fail =="
if node src/index.js command-scan --command 'gh pr create --body "Summary\n- escaped"'; then
  echo "expected unsafe gh command to fail" >&2
  exit 1
fi

echo
echo "== body-file command should pass =="
node src/index.js command-scan --command "gh pr create --body-file $TMP_DIR/reviewable-body.md"
