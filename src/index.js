#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function createResult() {
  return {
    ok: true,
    failures: [],
    warnings: [],
    checks: [],
  };
}

export function validateGithubBody(body) {
  const result = createResult();

  if (body.includes('\\n')) {
    result.failures.push({
      code: 'literal-escaped-newlines',
      message: 'Body contains literal \\n sequences. Use a markdown body file and --body-file.',
      fix: 'Rewrite the PR, issue, or comment body from a heredoc file, then update with gh pr edit --body-file /tmp/body.md.',
    });
  }

  if (body.trim().length === 0) {
    result.failures.push({
      code: 'empty-body',
      message: 'Body is empty.',
      fix: 'Create a reviewable markdown body with summary, verification, risk, and rollback sections.',
    });
  }

  result.ok = result.failures.length === 0;
  return result;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  const positional = [];

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = rest[index + 1];
      if (!next || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        index += 1;
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, flags, positional };
}

function printResult(result, json = false) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (result.ok) {
    process.stdout.write('agent-qc pass\n');
  } else {
    process.stderr.write('agent-qc fail\n');
  }

  for (const warning of result.warnings ?? []) {
    process.stdout.write(`- ${warning.code}: ${warning.message}\n`);
    if (warning.fix) {
      process.stdout.write(`  fix: ${warning.fix}\n`);
    }
  }

  for (const failure of result.failures) {
    process.stderr.write(`- ${failure.code}: ${failure.message}\n  fix: ${failure.fix}\n`);
    if (failure.suggestion) {
      process.stderr.write(`  suggest: ${failure.suggestion}\n`);
    }
  }
}

function githubPrBody({ repo, pr }) {
  if (!repo || !pr) {
    throw new Error('github-pr-body requires --repo owner/name --pr number');
  }

  return execFileSync('gh', ['pr', 'view', String(pr), '--repo', repo, '--json', 'body', '--jq', '.body'], {
    encoding: 'utf8',
  });
}

export function scanCommand(input) {
  const result = createResult();
  const suggestions = [];

  if (input.includes('gh pr create') || input.includes('gh pr edit')) {
    const hasUnsafeBody = input.includes('--body "') && input.includes('\\n');
    const hasMultilineString = /--body\s+["']((?:[^"']|\n)+)["']/
      .test(input) && (input.match(/--body/g) || []).length > 0;

    if (hasUnsafeBody || hasMultilineString) {
      result.failures.push({
        code: 'unsafe-github-body',
        message: 'GitHub command uses --body with multiline content or escaped newlines.',
        fix: 'Use --body-file with a heredoc or temp file instead of inline --body.',
        suggestion: 'Create a markdown body file, then use: gh pr create --body-file /tmp/pr-body.md',
      });
      suggestions.push('--body-file');
    }
  }

  result.ok = result.failures.length === 0;
  result.suggestions = suggestions;
  return result;
}

export function runReady({ cwd = process.cwd() } = {}) {
  const result = createResult();

  try {
    const output = execFileSync('atomcommit', ['--json'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const plan = JSON.parse(output);
    result.checks.push({
      name: 'atomcommit',
      status: 'pass',
      message: `Atomcommit analyzed ${plan.summary?.filesChanged ?? 0} changed file(s) into ${plan.summary?.suggestedCommits ?? 0} suggested commit(s).`,
      summary: plan.summary ?? null,
    });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      result.warnings.push({
        code: 'atomcommit-unavailable',
        message: 'atomcommit is not installed on PATH, so commit atomicity planning was skipped.',
        fix: 'Install atomcommit, then rerun agent-qc ready for a deterministic commit plan.',
      });
      result.checks.push({
        name: 'atomcommit',
        status: 'warn',
        message: 'Skipped because atomcommit is not available on PATH.',
      });
    } else {
      const message = error instanceof Error ? error.message : String(error);
      result.failures.push({
        code: 'atomcommit-failed',
        message: `atomcommit failed: ${message}`,
        fix: 'Fix the local atomcommit failure, or remove the invalid repo state and rerun agent-qc ready.',
      });
      result.checks.push({
        name: 'atomcommit',
        status: 'fail',
        message,
      });
    }
  }

  result.ok = result.failures.length === 0;
  return result;
}

function usage() {
  return `agent-qc\n\nUsage:\n  agent-qc ready [--json]\n  agent-qc github-pr-body --repo owner/name --pr 123 [--json]\n  agent-qc file-body --path /tmp/body.md [--json]\n  agent-qc command-scan [--command "cmd"] [--json]\n\nQuality gates:\n  ready           Run the local readiness gate. Calls atomcommit when it is available on PATH.\n  github-pr-body  Fetch a PR body with gh and fail on non-reviewable markdown issues.\n  file-body       Validate a local markdown body before posting it to GitHub.\n  command-scan    Scan a planned shell command (from stdin or --command) for unsafe patterns.\n                  Does NOT execute the command.\n`;
}

export function run(argv = process.argv.slice(2)) {
  const { command, flags } = parseArgs(argv);

  try {
    if (!command || command === 'help' || command === '--help' || command === '-h') {
      process.stdout.write(usage());
      return 0;
    }

    if (command === 'ready') {
      const result = runReady();
      printResult(result, Boolean(flags.json));
      return result.ok ? 0 : 1;
    }

    if (command === 'github-pr-body') {
      const body = githubPrBody({ repo: flags.repo, pr: flags.pr });
      const result = validateGithubBody(body);
      printResult(result, Boolean(flags.json));
      return result.ok ? 0 : 1;
    }

    if (command === 'file-body') {
      if (!flags.path) throw new Error('file-body requires --path /tmp/body.md');
      const body = readFileSync(flags.path, 'utf8');
      const result = validateGithubBody(body);
      printResult(result, Boolean(flags.json));
      return result.ok ? 0 : 1;
    }

    if (command === 'command-scan') {
      let input = flags.command;
      if (!input) {
        input = readFileSync(process.stdin.fd, 'utf8');
      }
      if (!input) throw new Error('command-scan requires input via --command or stdin');
      const result = scanCommand(input);

      if (flags.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        if (result.ok) {
          process.stdout.write('agent-qc command-scan pass\n');
        } else {
          process.stderr.write('agent-qc command-scan fail\n');
          for (const failure of result.failures) {
            process.stderr.write(`- ${failure.code}: ${failure.message}\n  fix: ${failure.fix}\n`);
            if (failure.suggestion) {
              process.stderr.write(`  suggest: ${failure.suggestion}\n`);
            }
          }
        }
      }
      return result.ok ? 0 : 1;
    }

    process.stderr.write(`Unknown command: ${command}\n\n${usage()}`);
    return 2;
  } catch (error) {
    const result = {
      ok: false,
      failures: [
        {
          code: 'runtime-error',
          message: error instanceof Error ? error.message : String(error),
          fix: 'Check command arguments and local tooling, then rerun agent-qc.',
        },
      ],
    };
    printResult(result, Boolean(flags.json));
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = run();
}
