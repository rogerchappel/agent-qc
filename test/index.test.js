import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGithubBody } from '../src/index.js';

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
