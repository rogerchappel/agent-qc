#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function packageVersion() {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return packageJson.version;
}

function createResult() {
  return {
    ok: true,
    failures: [],
    warnings: [],
    checks: [],
  };
}

function normalizeHeading(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function bodyHasHeading(body, heading) {
  const wanted = normalizeHeading(heading);
  return body
    .split(/\r?\n/)
    .some((line) => {
      const match = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
      return match ? normalizeHeading(match[1]) === wanted : false;
    });
}

function templateRequiredSections(cwd = process.cwd()) {
  const templatePath = join(cwd, '.github', 'pull_request_template.md');
  const defaults = ['Summary', 'Verification'];
  if (!existsSync(templatePath)) return defaults;

  const template = readFileSync(templatePath, 'utf8');
  const sections = [...defaults];
  for (const optional of ['Risk Level', 'Rollback Plan']) {
    if (bodyHasHeading(template, optional)) sections.push(optional);
  }
  return [...new Set(sections)];
}

export function validateGithubBody(body, { requiredSections = ['Summary', 'Verification'] } = {}) {
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
  } else {
    const missing = requiredSections.filter((section) => !bodyHasHeading(body, section));
    if (missing.length > 0) {
      result.failures.push({
        code: 'missing-review-sections',
        message: `Body is missing required review section(s): ${missing.join(', ')}.`,
        fix: `Add markdown headings for: ${missing.map((section) => `## ${section}`).join(', ')}.`,
      });
    }
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

  for (const check of result.checks ?? []) {
    process.stdout.write(`- ${check.name}: ${check.status}`);
    if (check.message) process.stdout.write(`: ${check.message}`);
    process.stdout.write('\n');
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

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function gitOk(cwd, args) {
  try {
    git(cwd, args);
    return true;
  } catch {
    return false;
  }
}

export function checkGitBranch({ repo = process.cwd(), base = 'origin/main' } = {}) {
  const result = createResult();
  let branch = '';

  try {
    branch = git(repo, ['branch', '--show-current']);
  } catch (error) {
    result.failures.push({
      code: 'git-branch-unavailable',
      message: 'Unable to inspect the current git branch.',
      fix: 'Run this command from inside a git repository with git available on PATH.',
    });
  }

  if (!branch) {
    result.failures.push({
      code: 'detached-head',
      message: 'Repository is in a detached HEAD state.',
      fix: 'Check out a named feature branch before reporting done.',
    });
  } else if (branch === 'main' || branch === 'master') {
    result.failures.push({
      code: 'protected-branch',
      message: `Current branch is ${branch}.`,
      fix: 'Create and work from a feature branch, not main or master.',
    });
  }

  try {
    const status = git(repo, ['status', '--porcelain']);
    if (status.length > 0) {
      result.failures.push({
        code: 'dirty-working-tree',
        message: 'Working tree has uncommitted changes.',
        fix: 'Commit, stash, or discard local changes before reporting done.',
      });
    }
  } catch {
    result.failures.push({
      code: 'git-status-unavailable',
      message: 'Unable to inspect working tree status.',
      fix: 'Run git status locally and fix repository issues before retrying.',
    });
  }

  if (gitOk(repo, ['rev-parse', '--verify', '--quiet', base])) {
    const behind = Number(git(repo, ['rev-list', '--count', `HEAD..${base}`]));
    if (behind > 0) {
      result.failures.push({
        code: 'branch-behind-base',
        message: `Current branch is behind ${base} by ${behind} commit(s).`,
        fix: `Update the branch with ${base} before reporting done.`,
      });
    }
  } else {
    result.warnings.push({
      code: 'base-ref-unavailable',
      message: `${base} is not available locally; skipped behind-base check without fetching.`,
      fix: `Fetch or create ${base}, then rerun agent-qc git-branch.`,
    });
  }

  result.checks.push({
    name: 'git-branch',
    status: result.failures.length > 0 ? 'fail' : result.warnings.length > 0 ? 'warn' : 'pass',
    message: branch ? `branch=${branch}, base=${base}` : `base=${base}`,
  });
  result.ok = result.failures.length === 0;
  return result;
}

export function isConventionalCommit(subject) {
  return /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([^)]+\))?!?: .+/.test(subject)
    || /^Revert ".+"/.test(subject);
}

export function checkGitCommits({ repo = process.cwd(), base = 'origin/main', maxCount = 5 } = {}) {
  const result = createResult();
  if (!gitOk(repo, ['rev-parse', '--verify', '--quiet', base])) {
    result.failures.push({
      code: 'base-ref-unavailable',
      message: `${base} cannot be resolved locally.`,
      fix: `Fetch or choose a valid base branch, then rerun agent-qc git-commits --base ${base}.`,
    });
    result.ok = false;
    return result;
  }

  const subjects = git(repo, ['log', '--format=%s', `${base}..HEAD`])
    .split('\n')
    .filter(Boolean);

  if (subjects.length === 0) {
    result.failures.push({
      code: 'no-commits-ahead',
      message: `HEAD has no commits ahead of ${base}.`,
      fix: 'Commit scoped changes before opening or updating a PR.',
    });
  }

  if (subjects.length > Number(maxCount)) {
    result.failures.push({
      code: 'too-many-commits',
      message: `Branch has ${subjects.length} commits ahead of ${base}; maximum is ${maxCount}.`,
      fix: 'Split into smaller PRs or squash fixup commits before requesting review.',
    });
  }

  const invalidSubjects = subjects.filter((subject) => !isConventionalCommit(subject));
  if (invalidSubjects.length > 0) {
    result.failures.push({
      code: 'non-conventional-commits',
      message: `Non-Conventional Commit subject(s): ${invalidSubjects.join('; ')}`,
      fix: 'Use Conventional Commit subjects such as feat(scope): message or fix: message.',
    });
  }

  result.checks.push({
    name: 'git-commits',
    status: result.failures.length > 0 ? 'fail' : 'pass',
    message: `${subjects.length} commit(s) ahead of ${base}`,
    subjects,
  });
  result.ok = result.failures.length === 0;
  return result;
}

function mergeResult(target, source) {
  target.failures.push(...(source.failures ?? []));
  target.warnings.push(...(source.warnings ?? []));
  target.checks.push(...(source.checks ?? []));
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

  if (/\bgh\s+pr\s+(?:create|edit)\b/.test(input)) {
    const inlineBodies = [...input.matchAll(/(?:^|\s)--body(?:\s*=\s*|\s+)(?:\$)?(["'])((?:\\[\s\S]|(?!\1)[\s\S])*)\1/g)]
      .map((match) => match[2]);
    const hasUnsafeBody = inlineBodies.some((body) => body.includes('\\n') || body.includes('\n'));

    if (hasUnsafeBody) {
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

export function runReady({ cwd = process.cwd(), base = 'origin/main', maxCount = 5 } = {}) {
  const result = createResult();

  mergeResult(result, checkGitBranch({ repo: cwd, base }));
  if (gitOk(cwd, ['rev-parse', '--verify', '--quiet', base])) {
    mergeResult(result, checkGitCommits({ repo: cwd, base, maxCount }));
  }

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
  return `agent-qc\n\nUsage:\n  agent-qc --version\n  agent-qc ready [--repo .] [--base origin/main] [--max-count 5] [--json]\n  agent-qc git-branch [--repo .] [--base origin/main] [--json]\n  agent-qc git-commits [--repo .] [--base origin/main] [--max-count 5] [--json]\n  agent-qc github-pr-body --repo owner/name --pr 123 [--json]\n  agent-qc file-body --path /tmp/body.md [--json]\n  agent-qc command-scan [--command "cmd"] [--json]\n\nQuality gates:\n  ready           Run the local readiness gate. Does not fetch or mutate git state.\n  git-branch      Check branch name, cleanliness, and behind-base state using local git refs.\n  git-commits     Check commits ahead of a base ref for count and Conventional Commit subjects.\n  github-pr-body  Fetch a PR body with gh and fail on non-reviewable markdown issues.\n  file-body       Validate a local markdown body before posting it to GitHub.\n  command-scan    Scan a planned shell command (from stdin or --command) for unsafe patterns.\n                  Does NOT execute the command.\n`;
}

export function run(argv = process.argv.slice(2)) {
  const { command, flags } = parseArgs(argv);

  try {
    if (!command || command === 'help' || command === '--help' || command === '-h') {
      process.stdout.write(usage());
      return 0;
    }

    if (command === '--version' || command === '-v' || command === 'version') {
      process.stdout.write(`${packageVersion()}\n`);
      return 0;
    }

    if (command === 'ready') {
      const result = runReady({ cwd: flags.repo || process.cwd(), base: flags.base || 'origin/main', maxCount: flags['max-count'] || 5 });
      printResult(result, Boolean(flags.json));
      return result.ok ? 0 : 1;
    }

    if (command === 'git-branch') {
      const result = checkGitBranch({ repo: flags.repo || process.cwd(), base: flags.base || 'origin/main' });
      printResult(result, Boolean(flags.json));
      return result.ok ? 0 : 1;
    }

    if (command === 'git-commits') {
      const result = checkGitCommits({ repo: flags.repo || process.cwd(), base: flags.base || 'origin/main', maxCount: flags['max-count'] || 5 });
      printResult(result, Boolean(flags.json));
      return result.ok ? 0 : 1;
    }

    if (command === 'github-pr-body') {
      const body = githubPrBody({ repo: flags.repo, pr: flags.pr });
      const result = validateGithubBody(body, { requiredSections: templateRequiredSections(process.cwd()) });
      printResult(result, Boolean(flags.json));
      return result.ok ? 0 : 1;
    }

    if (command === 'file-body') {
      if (!flags.path) throw new Error('file-body requires --path /tmp/body.md');
      const body = readFileSync(flags.path, 'utf8');
      const result = validateGithubBody(body, { requiredSections: templateRequiredSections(process.cwd()) });
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
