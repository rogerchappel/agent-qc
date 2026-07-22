import test from 'node:test';
import assert from 'node:assert/strict';
import { checkGitBranch, checkGitCommits, isConventionalCommit, validateGithubBody, scanCommand, run, runReady } from '../src/index.js';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, unlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function tmpRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'agent-qc-repo-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'agent-qc@example.test'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Agent QC'], { cwd: repo });
  writeFileSync(join(repo, 'README.md'), '# tmp\n');
  execFileSync('git', ['add', 'README.md'], { cwd: repo });
  execFileSync('git', ['commit', '-m', 'chore: initial commit'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['branch', 'origin/main'], { cwd: repo });
  return repo;
}

test('passes reviewable markdown bodies', () => {
  const body = '## Summary\n- Updated docs\n\n## Verification\n- node --test\n\n## Risk Level\n- Low\n\n## Rollback Plan\n- Revert commit\n';
  const result = validateGithubBody(body, { requiredSections: ['Summary', 'Verification', 'Risk Level', 'Rollback Plan'] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test('fails literal escaped newline sequences', () => {
  const result = validateGithubBody('## Summary\\n- Updated docs\\n\\n## Verification\\n- node --test');
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].code, 'literal-escaped-newlines');
});

test('fails empty bodies', () => {
  const result = validateGithubBody('   ');
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].code, 'empty-body');
});

test('fails bodies missing required sections', () => {
  const result = validateGithubBody('## Summary\n- Updated docs\n', { requiredSections: ['Summary', 'Verification'] });
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].code, 'missing-review-sections');
  assert.match(result.failures[0].message, /Verification/);
});

test('command-scan passes safe commands', () => {
  const result = scanCommand('ls -la');
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test('command-scan passes safe git command', () => {
  const result = scanCommand('git status');
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test('command-scan fails gh pr create with unsafe --body', () => {
  const result = scanCommand('gh pr create --title "test" --body "## Summary\\n- Fix bug"');
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].code, 'unsafe-github-body');
  assert.ok(result.suggestions.includes('--body-file'));
});

test('command-scan fails gh pr edit with unsafe --body', () => {
  const result = scanCommand('gh pr edit 123 --body "## Update\\n- More changes"');
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].code, 'unsafe-github-body');
});

test('command-scan fails unsafe equals body syntax', () => {
  const result = scanCommand('gh pr create --title "test" --body="## Summary\\n- Fix bug"');
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].code, 'unsafe-github-body');
});

test('command-scan fails unsafe single-quoted body syntax', () => {
  const result = scanCommand("gh pr edit 123 --body '## Update\\n- More changes'");
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].code, 'unsafe-github-body');
});

test('command-scan fails literal multiline body syntax', () => {
  const result = scanCommand('gh pr create --title "test" --body "## Summary\n- Fix bug"');
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].code, 'unsafe-github-body');
});

test('command-scan fails gh pr create separated by ordinary shell whitespace', () => {
  const result = scanCommand('gh   pr\tcreate --body "## Summary\\n- Fix bug"');
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].code, 'unsafe-github-body');
  assert.ok(result.suggestions.includes('--body-file'));
});

test('command-scan fails ANSI-C-quoted body with escaped newlines', () => {
  const result = scanCommand("gh pr edit 123 --body $'## Update\\n- More changes'");
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].code, 'unsafe-github-body');
  assert.ok(result.suggestions.includes('--body-file'));
});

test('command-scan passes gh pr create with --body-file', () => {
  const result = scanCommand('gh pr create --title "test" --body-file /tmp/pr-body.md');
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test('file-body CLI validates shipped PR body fixtures', () => {
  const cwd = new URL('..', import.meta.url).pathname;
  const reviewable = spawnSync(process.execPath, ['src/index.js', 'file-body', '--path', 'fixtures/pr-bodies/reviewable.md', '--json'], {
    encoding: 'utf8',
    cwd,
  });
  assert.equal(reviewable.status, 0);
  assert.equal(JSON.parse(reviewable.stdout).ok, true);

  const escaped = spawnSync(process.execPath, ['src/index.js', 'file-body', '--path', 'fixtures/pr-bodies/escaped-newlines.md', '--json'], {
    encoding: 'utf8',
    cwd,
  });
  assert.equal(escaped.status, 1);
  const parsed = JSON.parse(escaped.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.failures[0].code, 'literal-escaped-newlines');
});

test('command-scan via stdin', () => {
  const tmpFile = join(tmpdir(), `test-stdin-${Date.now()}.md`);
  writeFileSync(tmpFile, 'gh pr create --body "test\\nbody"');

  const result = spawnSync('node', ['src/index.js', 'command-scan'], {
    input: 'gh pr create --body "test\\nbody"',
    encoding: 'utf8',
    cwd: new URL('..', import.meta.url).pathname,
  });

  unlinkSync(tmpFile);
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes('unsafe-github-body'));
});

test('command-scan via --command flag', () => {
  const result = run(['command-scan', '--command', 'ls -la']);
  assert.equal(result, 0);
});

test('prints package version', () => {
  const result = spawnSync(process.execPath, ['src/index.js', '--version'], {
    encoding: 'utf8',
    cwd: new URL('..', import.meta.url).pathname,
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '0.1.0');
});

test('command-scan json output', () => {
  const result = run(['command-scan', '--command', 'gh pr create --body "a\\nb"', '--json']);
  assert.equal(result, 1);
});

test('validates Conventional Commit subjects', () => {
  assert.equal(isConventionalCommit('feat(git): add branch hygiene gate'), true);
  assert.equal(isConventionalCommit('fix: repair parser'), true);
  assert.equal(isConventionalCommit('update docs'), false);
});

test('git-branch passes on clean feature branch', () => {
  const repo = tmpRepo();
  try {
    execFileSync('git', ['checkout', '-b', 'feat/clean'], { cwd: repo, stdio: 'ignore' });
    const result = checkGitBranch({ repo, base: 'origin/main' });
    assert.equal(result.ok, true);
    assert.equal(result.checks[0].status, 'pass');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('git-branch fails on main and dirty working tree', () => {
  const repo = tmpRepo();
  try {
    writeFileSync(join(repo, 'dirty.txt'), 'dirty\n');
    const result = checkGitBranch({ repo, base: 'origin/main' });
    assert.equal(result.ok, false);
    assert.deepEqual(result.failures.map((failure) => failure.code), ['protected-branch', 'dirty-working-tree']);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('git-commits passes scoped Conventional Commit branch', () => {
  const repo = tmpRepo();
  try {
    execFileSync('git', ['checkout', '-b', 'feat/commit-check'], { cwd: repo, stdio: 'ignore' });
    writeFileSync(join(repo, 'feature.txt'), 'feature\n');
    execFileSync('git', ['add', 'feature.txt'], { cwd: repo });
    execFileSync('git', ['commit', '-m', 'feat: add feature file'], { cwd: repo, stdio: 'ignore' });
    const result = checkGitCommits({ repo, base: 'origin/main', maxCount: 5 });
    assert.equal(result.ok, true);
    assert.equal(result.checks[0].message, '1 commit(s) ahead of origin/main');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('git-commits fails zero ahead commits and bad subjects', () => {
  const repo = tmpRepo();
  try {
    let result = checkGitCommits({ repo, base: 'origin/main', maxCount: 5 });
    assert.equal(result.ok, false);
    assert.equal(result.failures[0].code, 'no-commits-ahead');

    execFileSync('git', ['checkout', '-b', 'bad/commit'], { cwd: repo, stdio: 'ignore' });
    writeFileSync(join(repo, 'bad.txt'), 'bad\n');
    execFileSync('git', ['add', 'bad.txt'], { cwd: repo });
    execFileSync('git', ['commit', '-m', 'update stuff'], { cwd: repo, stdio: 'ignore' });
    result = checkGitCommits({ repo, base: 'origin/main', maxCount: 5 });
    assert.equal(result.ok, false);
    assert.equal(result.failures[0].code, 'non-conventional-commits');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('ready warns when atomcommit is missing', () => {
  const repo = tmpRepo();
  const noAtomcommitPath = '/opt/homebrew/bin:/usr/bin:/bin';
  try {
    execFileSync('git', ['checkout', '-b', 'feat/ready'], { cwd: repo, stdio: 'ignore' });
    writeFileSync(join(repo, 'ready.txt'), 'ready\n');
    execFileSync('git', ['add', 'ready.txt'], { cwd: repo });
    execFileSync('git', ['commit', '-m', 'feat: add ready fixture'], { cwd: repo, stdio: 'ignore' });
    const result = spawnSync(process.execPath, ['src/index.js', 'ready', '--repo', repo, '--json'], {
      cwd: new URL('..', import.meta.url).pathname,
      encoding: 'utf8',
      env: { ...process.env, PATH: noAtomcommitPath },
    });

    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.warnings[0].code, 'atomcommit-unavailable');
    assert.equal(parsed.checks.at(-1).status, 'warn');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('ready passes through atomcommit summary when available', () => {
  const repo = tmpRepo();
  const binDir = mkdtempSync(join(tmpdir(), 'agent-qc-bin-'));
  const atomcommitPath = join(binDir, 'atomcommit');
  writeFileSync(atomcommitPath, '#!/bin/sh\nprintf \'{"summary":{"filesChanged":2,"suggestedCommits":1},"commits":[]}\\n\'\n');
  chmodSync(atomcommitPath, 0o755);

  try {
    execFileSync('git', ['checkout', '-b', 'feat/ready'], { cwd: repo, stdio: 'ignore' });
    writeFileSync(join(repo, 'ready.txt'), 'ready\n');
    execFileSync('git', ['add', 'ready.txt'], { cwd: repo });
    execFileSync('git', ['commit', '-m', 'feat: add ready fixture'], { cwd: repo, stdio: 'ignore' });
    const result = spawnSync(process.execPath, ['src/index.js', 'ready', '--repo', repo, '--json'], {
      cwd: new URL('..', import.meta.url).pathname,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${binDir}:/opt/homebrew/bin:/usr/bin:/bin` },
    });

    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.warnings, []);
    assert.equal(parsed.checks.at(-1).status, 'pass');
    assert.deepEqual(parsed.checks.at(-1).summary, { filesChanged: 2, suggestedCommits: 1 });
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test('runReady returns warning state when atomcommit is missing', () => {
  const repo = tmpRepo();
  const originalPath = process.env.PATH;
  const noAtomcommitPath = '/opt/homebrew/bin:/usr/bin:/bin';
  process.env.PATH = noAtomcommitPath;

  try {
    execFileSync('git', ['checkout', '-b', 'feat/runready'], { cwd: repo, stdio: 'ignore' });
    writeFileSync(join(repo, 'ready.txt'), 'ready\n');
    execFileSync('git', ['add', 'ready.txt'], { cwd: repo });
    execFileSync('git', ['commit', '-m', 'feat: add ready fixture'], { cwd: repo, stdio: 'ignore' });
    const result = runReady({ cwd: repo });
    assert.equal(result.ok, true);
    assert.equal(result.warnings[0].code, 'atomcommit-unavailable');
  } finally {
    process.env.PATH = originalPath;
    rmSync(repo, { recursive: true, force: true });
  }
});
