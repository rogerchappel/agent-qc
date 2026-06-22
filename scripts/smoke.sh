#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/agent-qc-smoke.XXXXXX")"
trap 'rm -rf "$tmp_dir"' EXIT

node "$repo_root/src/index.js" --help | grep -q 'agent-qc'
test "$(node "$repo_root/src/index.js" --version)" = "0.1.0"

cat > "$tmp_dir/pr-body.md" <<'BODY'
## Summary
- Exercise local body validation.

## Verification
- npm run smoke

## Risk Level
- Low

## Rollback Plan
- Revert the smoke-check commit.
BODY

node "$repo_root/src/index.js" file-body --path "$tmp_dir/pr-body.md" --json \
  | node -e "let input=''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => { const result = JSON.parse(input); if (!result.ok) process.exit(1); });"

node "$repo_root/src/index.js" command-scan --command 'git status' | grep -q 'agent-qc command-scan pass'

if node "$repo_root/src/index.js" command-scan --command 'gh pr create --body "## Summary\n- unsafe"' > "$tmp_dir/unsafe.out" 2> "$tmp_dir/unsafe.err"; then
  echo "expected unsafe gh body command to fail" >&2
  exit 1
fi
grep -q 'unsafe-github-body' "$tmp_dir/unsafe.err"

printf 'agent-qc smoke passed\n'
