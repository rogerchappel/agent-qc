# PR Body Fixtures

These fixtures exercise the local `file-body` gate without calling GitHub.

- `reviewable.md` is a complete pull request body with the sections expected by
  the default repository template.
- `escaped-newlines.md` captures the common failure where an inline shell
  argument writes literal `\n` sequences into a GitHub Markdown body.

Run them locally:

```sh
node src/index.js file-body --path fixtures/pr-bodies/reviewable.md
node src/index.js file-body --path fixtures/pr-bodies/escaped-newlines.md
```
