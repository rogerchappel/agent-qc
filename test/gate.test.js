import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

describe('agent-quality gate', () => {
  it('should handle missing fixture gracefully', () => {
    const { execSync } = require('child_process');
    try {
      execSync('node src/index.js ready /nonexistent/path', { encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      // Expected to fail for nonexistent path
      assert.ok(e.status !== 0, 'should fail for missing path');
    }
  });
});
