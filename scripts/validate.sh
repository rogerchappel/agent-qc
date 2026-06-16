#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

failed=0

pass() {
  printf 'PASS: %s\n' "$1"
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  failed=1
}

check_file() {
  if [ -f "$1" ]; then
    pass "required file exists: $1"
  else
    fail "missing required file: $1"
  fi
}

check_dir() {
  if [ -d "$1" ]; then
    pass "required directory exists: $1"
  else
    fail "missing required directory: $1"
  fi
}

printf 'Checking agent-qc required files...\n'

check_file "README.md"
check_file "AGENTS.md"
check_file "CONTRIBUTING.md"
check_file "SECURITY.md"
check_file ".github/pull_request_template.md"

printf '\nChecking agent-qc required directories...\n'

check_dir ".github"
check_dir "docs"

printf '\nRunning local package checks...\n'
if pnpm release:check; then
  pass "pnpm release:check"
else
  fail "pnpm release:check"
fi

printf '\nRunning local readiness gate...\n'
current_branch="$(git branch --show-current 2>/dev/null || true)"
if [ "$current_branch" = "main" ] || [ "$current_branch" = "master" ] || [ -z "$current_branch" ]; then
  printf 'SKIP: agent-qc ready requires a named feature branch (current: %s)\n' "${current_branch:-detached}"
else
  commits_ahead="$(git rev-list --count origin/main..HEAD 2>/dev/null || printf '0')"
  if [ "$commits_ahead" = "0" ]; then
    printf 'SKIP: agent-qc ready requires commits ahead of origin/main.\n'
  elif node src/index.js ready --repo . --base origin/main --json; then
    pass "agent-qc ready"
  else
    fail "agent-qc ready"
  fi
fi

if [ "$failed" -ne 0 ]; then
  printf '\nValidation failed.\n' >&2
  exit 1
fi

printf '\nValidation passed.\n'
