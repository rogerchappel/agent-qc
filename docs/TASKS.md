# agent-qc Taskbrief Queue

Generated from the 2026-04-29 dogfood session.

Goal: make `agent-qc` a deterministic QC CLI for agentic development workflows, starting with GitHub body formatting and expanding to branch hygiene, commit quality, and PR readiness.

## Current Release Surface

The v0.1 release-candidate CLI now includes the first three taskbrief gates:

- PR body quality: `file-body`, `github-pr-body`, and `command-scan` reject
  empty bodies, literal escaped newlines, missing review sections, and unsafe
  inline GitHub CLI `--body` usage.
- Branch hygiene: `git-branch` checks for a clean named feature branch and a
  local base ref that is not ahead of the current branch.
- Commit reviewability: `git-commits` checks bounded commits ahead of the base
  ref and Conventional Commit style subjects.

Remaining queue items should build on these shipped commands instead of
reimplementing them.

```yaml
version: "0.1"
source: taskbrief
workspace: rogerchappel-oss
tasks:
  - id: agent-qc-pr-body-sections
    title: Enforce required PR body sections
    status: shipped
    repo: agent-qc
    branch: agent/pr-body-sections
    type: tests
    risk: low
    objective: Extend GitHub body validation to require reviewable PR body sections.
    context: V0.1 catches literal escaped newlines and empty bodies. The next failure mode is bodies that render but omit summary, verification, risk, or rollback context.
    allowed_paths:
      - src/index.js
      - test/**
      - README.md
    forbidden_paths:
      - .env*
      - secrets/**
      - .github/**
      - package.json
      - pnpm-lock.yaml
    verification:
      - pnpm test
      - pnpm check
      - node src/index.js file-body --path /tmp/good-pr-body.md
    stop_conditions:
      - CLI contract requires new dependencies
      - changing command names or existing output format
    expected_commits:
      - "feat(github): require reviewable PR body sections"
    review_pack_required: true
    human_decision_needed: []
    agent_prompt: >
      In agent-qc, extend validateGithubBody so PR/review bodies fail when they are missing required sections: Summary and Verification at minimum, plus Risk Level and Rollback Plan when present in the repo template. Keep the change dependency-free. Add node:test coverage for passing and failing bodies. Do not touch package metadata or GitHub workflows. Run pnpm test and pnpm check. Return a review pack.

  - id: agent-qc-git-branch-hygiene
    title: Add branch hygiene gate
    status: shipped
    repo: agent-qc
    branch: agent/git-branch-hygiene
    type: qa
    risk: medium
    objective: Add a deterministic gate for branch state before an agent reports done.
    context: Roger wants checks for not working on main, branch freshness against origin/main, and clean working tree before PR creation.
    allowed_paths:
      - src/index.js
      - test/**
      - README.md
    forbidden_paths:
      - .env*
      - secrets/**
      - .github/**
    verification:
      - pnpm test
      - pnpm check
      - node src/index.js git-branch --repo . --json
    stop_conditions:
      - destructive git operations are needed
      - command would mutate the repository
      - remote main cannot be inspected safely
    expected_commits:
      - "feat(git): add branch hygiene gate"
    review_pack_required: true
    human_decision_needed:
      - confirm exact freshness policy if origin/main is unavailable
    agent_prompt: >
      In agent-qc, add a read-only `git-branch` command that checks the current branch is not main/master, working tree is clean, origin/main exists when available, and the branch is not behind origin/main. Use child_process git commands only. Do not mutate git state. Add tests for pure validation helpers where possible and document the command. Run pnpm test and pnpm check. Return a review pack.

  - id: agent-qc-commit-atomicity
    title: Add commit atomicity gate
    status: shipped
    repo: agent-qc
    branch: agent/commit-atomicity-gate
    type: qa
    risk: medium
    objective: Add commit count and Conventional Commit checks for reviewable agent branches.
    context: Agent workflows need deterministic feedback on commit history before PR review: too many mixed commits, missing Conventional Commit subjects, or no commits ahead of main.
    allowed_paths:
      - src/index.js
      - test/**
      - README.md
    forbidden_paths:
      - .env*
      - secrets/**
      - .github/**
    verification:
      - pnpm test
      - pnpm check
      - node src/index.js git-commits --base origin/main --json
    stop_conditions:
      - rewriting commit history is required
      - base branch cannot be resolved
    expected_commits:
      - "feat(git): add commit atomicity gate"
    review_pack_required: true
    human_decision_needed:
      - decide default max commit count per branch
    agent_prompt: >
      In agent-qc, add a read-only `git-commits` command that inspects commits ahead of a base branch, fails if there are zero commits, flags non-Conventional Commit subjects, and supports a configurable max commit count. Do not rewrite history. Add tests for subject validation and result formatting. Update README. Run pnpm test and pnpm check. Return a review pack.

  - id: agent-qc-command-scan
    title: Add planned command scanner for risky GitHub body usage
    repo: agent-qc
    branch: agent/github-command-scan
    type: qa
    risk: low
    objective: Detect unsafe planned GitHub write commands before they execute.
    context: Post-write validation catches bad PR bodies after creation, but deterministic workflows should also block commands like `gh pr create --body "...\\n..."` before posting.
    allowed_paths:
      - src/index.js
      - test/**
      - README.md
    forbidden_paths:
      - .env*
      - secrets/**
      - .github/**
    verification:
      - pnpm test
      - pnpm check
      - printf '%s\n' 'gh pr create --body "## Summary\\n- bad"' | node src/index.js command-scan
    stop_conditions:
      - shell execution is required instead of static scanning
      - parser requires heavy dependencies
    expected_commits:
      - "feat(github): scan planned commands for unsafe bodies"
    review_pack_required: true
    human_decision_needed: []
    agent_prompt: >
      In agent-qc, add a dependency-free `command-scan` command that reads planned shell commands from stdin or `--command`, fails GitHub write commands using multiline `--body` or literal escaped newline sequences, and recommends `--body-file`. It must not execute commands. Add tests and README examples. Run pnpm test and pnpm check. Return a review pack.

  - id: agent-qc-readiness-command
    title: Add combined readiness gate
    repo: agent-qc
    branch: agent/readiness-gate
    type: qa
    risk: medium
    objective: Provide one command agents can run before reporting done.
    context: Individual gates are useful, but the operating model needs a single deterministic command that prints pass/fail JSON and human feedback.
    allowed_paths:
      - src/index.js
      - test/**
      - README.md
      - scripts/validate.sh
    forbidden_paths:
      - .env*
      - secrets/**
      - .github/**
    verification:
      - pnpm test
      - pnpm check
      - node src/index.js ready --repo . --base origin/main --json
      - bash scripts/validate.sh
    stop_conditions:
      - command would mutate git or GitHub state
      - requires external services beyond read-only gh/git inspection
    expected_commits:
      - "feat(cli): add combined readiness gate"
    review_pack_required: true
    human_decision_needed:
      - confirm default gates for V1 readiness
    agent_prompt: >
      In agent-qc, add a read-only `ready` command that runs available local checks and returns a single pass/fail result with JSON support. It should compose existing validation helpers, not duplicate logic. Update scripts/validate.sh to call it where safe. Run pnpm test, pnpm check, and bash scripts/validate.sh. Return a review pack.
```

## Recommended execution order

1. `agent-qc-command-scan`
2. `agent-qc-pr-body-sections`
3. `agent-qc-git-branch-hygiene`
4. `agent-qc-commit-atomicity`
5. `agent-qc-readiness-command`

Keep CrewCmd integration out of V1. This repo should stay local-first and deterministic.
