import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGithubBody, scanCommand, run } from '../src/index.js';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { writeFileSync, unlinkSync } from 'node:fs';
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
