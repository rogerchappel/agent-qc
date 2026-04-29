import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGithubBody, scanCommand, run, runReady } from '../src/index.js';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, unlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('passes normal markdown bodies', () => {
  const result = validateGithubBody('## Summary\n- Updated docs\n\n## Verification\n- node --test\n');
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

test('command-scan passes gh pr create with --body-file', () => {
  const result = scanCommand('gh pr create --title "test" --body-file /tmp/pr-body.md');
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
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

test('command-scan json output', () => {
  const result = run(['command-scan', '--command', 'gh pr create --body "a\\nb"', '--json']);
  assert.equal(result, 1);
});

test('ready warns when atomcommit is missing', () => {
  const result = spawnSync(process.execPath, ['src/index.js', 'ready', '--json'], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
    env: { ...process.env, PATH: mkdtempSync(join(tmpdir(), 'agent-qc-empty-path-')) },
  });

  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.warnings[0].code, 'atomcommit-unavailable');
  assert.equal(parsed.checks[0].status, 'warn');
});

test('ready passes through atomcommit summary when available', () => {
  const binDir = mkdtempSync(join(tmpdir(), 'agent-qc-bin-'));
  const atomcommitPath = join(binDir, 'atomcommit');
  writeFileSync(atomcommitPath, '#!/bin/sh\nprintf \'{"summary":{"filesChanged":2,"suggestedCommits":1},"commits":[]}\\n\'\n');
  chmodSync(atomcommitPath, 0o755);

  const result = spawnSync(process.execPath, ['src/index.js', 'ready', '--json'], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
    env: { ...process.env, PATH: binDir },
  });

  rmSync(binDir, { recursive: true, force: true });
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.warnings, []);
  assert.equal(parsed.checks[0].status, 'pass');
  assert.deepEqual(parsed.checks[0].summary, { filesChanged: 2, suggestedCommits: 1 });
});

test('runReady returns warning state when atomcommit is missing', () => {
  const originalPath = process.env.PATH;
  const emptyPath = mkdtempSync(join(tmpdir(), 'agent-qc-runready-'));
  process.env.PATH = emptyPath;

  try {
    const result = runReady();
    assert.equal(result.ok, true);
    assert.equal(result.warnings[0].code, 'atomcommit-unavailable');
  } finally {
    process.env.PATH = originalPath;
    rmSync(emptyPath, { recursive: true, force: true });
  }
});
