import { access, readFile, readdir } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const failures = [];

function requireField(path, value) {
  if (value === undefined || value === null || value === '') {
    failures.push(`package.json is missing ${path}`);
  }
}

requireField('repository.url', pkg.repository?.url);
requireField('bugs.url', pkg.bugs?.url);
requireField('homepage', pkg.homepage);
requireField('license', pkg.license);
requireField('bin.agent-qc', pkg.bin?.['agent-qc']);

for (const script of ['check', 'test', 'smoke', 'demo:pr-body-guard', 'package:smoke', 'release:check']) {
  requireField(`scripts.${script}`, pkg.scripts?.[script]);
}

for (const file of [
  'src',
  'docs',
  'examples',
  'fixtures',
  'AGENTS.md',
  'CODE_OF_CONDUCT.md',
  'README.md',
  'LICENSE',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md'
]) {
  if (!pkg.files?.includes(file)) {
    failures.push(`package files allowlist is missing ${file}`);
  }
  await access(new URL(`../${file}`, import.meta.url)).catch(() => {
    failures.push(`allowlisted path is missing on disk: ${file}`);
  });
}

const workflows = await readdir(new URL('../.github/workflows/', import.meta.url)).catch(() => []);
if (!workflows.some((file) => file.endsWith('.yml') || file.endsWith('.yaml'))) {
  failures.push('no GitHub Actions workflow found');
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('release readiness ok');
