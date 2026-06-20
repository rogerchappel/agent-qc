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

if [ "$failed" -ne 0 ]; then
  printf '\nValidation failed.\n' >&2
  exit 1
fi

printf '\nValidation passed.\n'
