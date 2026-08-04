# agent-qc

Deterministic quality gates for agentic development workflows.

`agent-qc` catches workflow failures before an agent reports done. It stays local-first and deterministic: checks inspect local files and local git refs, and never fetch, post, or mutate repository state unless you explicitly run a separate write command.

## Status

Early V0.1 dogfood build.

## Install

```sh
npm install
npm run release:check
```

After publication, install the CLI with npm:

```sh
npm install -g agent-qc
```

## Usage

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

`ready` runs the local deterministic readiness checks built into `agent-qc`: branch hygiene, commit reviewability, and optional `atomcommit --json` when `atomcommit` is installed on `PATH`. Missing `atomcommit` is a warning for now, not a hard failure. Git checks use local refs only and never fetch: if the requested base ref is unavailable, branch hygiene warns and commit reviewability fails the readiness gate. Run `git fetch origin main` yourself first to provide or refresh the base ref.

Check the current branch is a clean, named feature branch and is not behind the local base ref:

```sh
agent-qc git-branch --repo . --base origin/main
```

Check commits ahead of the base ref for Conventional Commit subjects and a bounded count:

```sh
agent-qc git-commits --repo . --base origin/main --max-count 5
```

For `git-commits` and `ready`, `--max-count` accepts positive integers only.
Each command rejects unknown options, missing option values, and positional arguments with exit code 2 before running its quality gate.

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

## Runnable demo

The repository includes a local demo for the PR body guard:

```sh
bash examples/pr-body-guard-demo.sh
```

It creates temporary Markdown bodies, proves that literal `\n` bodies fail,
checks the passing `--body-file` path, and does not call GitHub.

## Promotion notes

- [Video brief](docs/promo/video-brief.md)
- [Social hooks](docs/promo/social-hooks.md)

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


## Verification

Run the local quality gates before opening a pull request:

```sh
npm run lint
npm test
npm run smoke
```

`npm run lint` is an alias for the repository static check so contributors can use the common npm workflow without guessing the project-specific command.

## Limitations

- `agent-qc` only inspects local repository state and local files. Fetch the base
  branch yourself before relying on freshness-sensitive branch checks.
- GitHub PR body checks require `gh` authentication and read the existing PR
  body; they do not create, edit, merge, or close pull requests.
- Command scanning is a deterministic guard for known risky patterns. It is not
  a shell parser or a substitute for reviewing the command before execution.

## Next gates

- CrewCmd task, branch, and PR metadata checks.
- Richer per-repository readiness profiles once the V1 local gates settle.

## Verify

Run the same release-readiness validation used by CI:

```sh
npm run release:readiness
bash scripts/validate.sh
```

`npm run release:readiness` validates package metadata, CLI bin metadata, npm
allowlist coverage, required support docs, and CI presence. The validation
script runs the package release check and only runs `agent-qc ready` when the
current branch has commits ahead of `origin/main`.

```sh
npm test
npm run check
npm run smoke
npm run package:smoke
npm run release:check
```

`npm run smoke` verifies CLI help/version output, local PR-body validation,
safe command scanning, and unsafe inline GitHub body detection.

`npm run package:smoke` asserts that the packed tarball keeps the CLI runtime,
demo script, promo docs, agent guidance, license, changelog, contributing
guide, code of conduct, and security policy expected by users.

## License

MIT
