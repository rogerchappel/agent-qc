# agent-qc

Deterministic quality gates for agentic development workflows.

`agent-qc` catches workflow failures before an agent reports done. It stays local-first and deterministic: checks inspect local files and local git refs, and never fetch, post, or mutate repository state unless you explicitly run a separate write command.

## Status

Early V0.1 dogfood build.

## Install

```sh
pnpm install
```

After publication, install the CLI with npm:

```sh
npm install -g agent-qc
```

## Use

Run the one-command local handoff gate:

```sh
agent-qc ready
```

Check the installed CLI version:

```sh
agent-qc --version
```

Use JSON output for automation:

```sh
agent-qc ready --json
```

`ready` runs the local deterministic readiness checks built into `agent-qc`: branch hygiene, commit reviewability, and optional `atomcommit --json` when `atomcommit` is installed on `PATH`. Missing `atomcommit` is a warning for now, not a hard failure. Git checks use local refs only; run `git fetch origin main` yourself first if you want the freshest base ref.

Check the current branch is a clean, named feature branch and is not behind the local base ref:

```sh
agent-qc git-branch --repo . --base origin/main
```

Check commits ahead of the base ref for Conventional Commit subjects and a bounded count:

```sh
agent-qc git-commits --repo . --base origin/main --max-count 5
```

Validate a local body before posting to GitHub. In this repository, body validation requires the pull request template sections: Summary, Verification, Risk Level, and Rollback Plan.

```sh
agent-qc file-body --path /tmp/pr-body.md
```

Validate an existing PR body after creation or edit:

```sh
agent-qc github-pr-body --repo rogerchappel/agent-qc --pr 1
```

Machine-readable output:

```sh
agent-qc github-pr-body --repo rogerchappel/agent-qc --pr 1 --json
```

Scan a planned shell command without executing it:

```sh
echo 'gh pr create --body "## Summary\\n- Fix bug"' | agent-qc command-scan
```

Or use the `--command` flag:

```sh
agent-qc command-scan --command 'gh pr create --body "## Summary\\n- Fix bug"'
```

Safe commands pass through:

```sh
agent-qc command-scan --command 'ls -la'
```

Use JSON output for automation:

```sh
echo 'gh pr create --body "test\\nbody"' | agent-qc command-scan --json
```

## Current gates

- `ready` provides a single local handoff command for agents.
- `ready` composes branch hygiene, commit reviewability, and optional `atomcommit --json` checks.
- `git-branch` fails work on `main`/`master`, detached HEAD, dirty working trees, and branches behind the local base ref.
- `git-commits` fails zero-ahead branches, non-Conventional Commit subjects, and branches above `--max-count`.
- Fails literal `\n` sequences in GitHub markdown bodies.
- Fails empty GitHub markdown bodies and bodies missing required review sections.
- Provides concrete fix messages for the agent.
- Scans planned shell commands via `command-scan` (does not execute).
- Fails `gh pr create` or `gh pr edit` commands using unsafe `--body` with escaped newlines.
- Recommends `--body-file` when unsafe patterns are detected.

## Next gates

- CrewCmd task, branch, and PR metadata checks.
- Richer per-repository readiness profiles once the V1 local gates settle.

## Verify

```sh
npm test
npm run check
npm run package:smoke
npm run release:check
bash scripts/validate.sh
```

## License

MIT
