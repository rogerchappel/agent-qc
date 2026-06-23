# Video Brief: Catch Bad PR Bodies Before Posting

## Viewer

Agents and maintainers who use GitHub CLI from terminal automation and want a quick local check before a PR is opened or edited.

## Demo arc

1. Show the common failure: a `gh pr create --body "...\n..."` command that would render literal escaped newlines.
2. Run `bash examples/pr-body-guard-demo.sh`.
3. Point out the two failing checks: `file-body` rejects a body with literal `\n`, and `command-scan` rejects unsafe inline GitHub bodies.
4. Show the passing path: a normal Markdown body and a `--body-file` GitHub command.
5. Close on the local-first boundary: the demo does not call GitHub or mutate a repository.

## On-screen commands

```sh
bash examples/pr-body-guard-demo.sh
node src/index.js ready --json
```

## Honest limitations

- `ready` only calls `atomcommit` when it is installed on `PATH`.
- `github-pr-body` needs `gh` and a readable PR, so the fixture-backed demo uses `file-body` and `command-scan`.
- The current gate focuses on body quality and unsafe GitHub CLI body patterns; broader branch and PR metadata gates are still roadmap items.
