# Social Hooks

## Short posts

1. `agent-qc` catches a surprisingly expensive GitHub CLI mistake before it reaches a PR: literal `\n` sequences in Markdown bodies. The new demo shows the failure and the `--body-file` fix locally.

2. Tiny local gate, real workflow payoff: run `agent-qc command-scan` on a planned `gh pr create` command and fail fast when an inline body would render badly.

3. The `agent-qc` demo does not need network access. It validates local Markdown and scans a planned GitHub CLI command so agents can catch bad handoffs before posting.

## Demo CTA

```sh
bash examples/pr-body-guard-demo.sh
```

## Grounding facts

- Commands demonstrated: `file-body`, `command-scan`, and `ready`.
- The fixture-backed demo does not call GitHub.
- The recommended fix is `gh pr create --body-file <markdown-file>`.
