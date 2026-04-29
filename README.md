# agent-qc

Deterministic quality gates for agentic development workflows.

`agent-qc` catches workflow failures before an agent reports done. The first gate focuses on GitHub markdown body quality, including the exact failure mode where `gh pr create --body "...\n..."` renders literal escaped newlines.

## Status

Early V0.1 dogfood build.

## Install

```sh
pnpm install
```

## Use

Validate a local body before posting to GitHub:

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

- Fails literal `\n` sequences in GitHub markdown bodies.
- Fails empty GitHub markdown bodies.
- Provides a concrete fix message for the agent.
- Scans planned shell commands via `command-scan` (does not execute).
- Fails `gh pr create` or `gh pr edit` commands using unsafe `--body` with escaped newlines.
- Recommends `--body-file` when unsafe patterns are detected.

## Next gates

- Branch is not `main`.
- Branch is rebased on `origin/main`.
- Commit count and atomicity checks.
- PR body section checks.
- CrewCmd task, branch, and PR metadata checks.

## Verify

```sh
pnpm test
pnpm check
```

## License

MIT
