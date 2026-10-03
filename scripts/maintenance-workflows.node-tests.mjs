import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const guard = join(root, 'scripts/verify-maintenance-release.mjs');
const workflow = (name) => yaml.load(readFileSync(join(root, '.github/workflows', name), 'utf8'));
const commands = (job) => job.steps.map((step) => step.run ?? '').join('\n');

function assertVerification(job) {
  const run = commands(job);
  for (const command of [
    'npm ci', 'npx tsc --noEmit', 'npm test', 'npm run build',
    'node --test scripts/pack-maintenance.node-tests.mjs scripts/maintenance-workflows.node-tests.mjs',
    'npx eslint --config scripts/yaml-security-eslint.config.mjs src/utils/yamlSecurity.test.ts --max-warnings=0',
    'node scripts/pack-maintenance.mjs', 'node scripts/verify-yaml-security.mjs',
  ]) assert.ok(run.includes(command), `missing actual verification: ${command}`);
  assert.ok(run.indexOf('npm run build') < run.indexOf('node scripts/pack-maintenance.mjs'));
  assert.ok(run.indexOf('npm run build') < run.indexOf('node --test scripts/pack-maintenance.node-tests.mjs'), 'packed Node tests require freshly built dist');
  assert.ok(run.indexOf('node scripts/pack-maintenance.mjs') < run.indexOf('node scripts/verify-yaml-security.mjs'));
}

for (const name of ['build.yml', 'publish.yml']) {
  test(`${name} has explicit repository-only authority and pinned hosted actions`, () => {
    const config = workflow(name);
    assert.doesNotMatch(JSON.stringify(config), /\bsecrets\b|repository-dispatch/);
    assert.ok(config.permissions, 'permissions must not inherit repository write defaults');
    for (const job of Object.values(config.jobs)) {
      assert.equal(job['runs-on'], 'ubuntu-latest');
      for (const step of job.steps) {
        if (step.uses) assert.match(step.uses, /^actions\/(checkout|setup-node)@[0-9a-f]{40}$/);
      }
      assert.equal(job.steps.find((step) => step.uses?.startsWith('actions/setup-node@')).with['node-version'], '22');
    }
  });
}

test('Build covers the actual maintenance PR and runs source and packed verification', () => {
  const config = workflow('build.yml');
  assert.deepEqual(config.on.push.branches, ['release/0.2.x']);
  assert.deepEqual(config.on.pull_request.branches, ['release/0.2.x']);
  assert.deepEqual(config.permissions, { contents: 'read', packages: 'read' });
  assert.equal(config.jobs.build.name, 'Build');
  assertVerification(config.jobs.build);
});

test('publisher guards the tag and publishes tested maintenance bytes without replacing latest', () => {
  const config = workflow('publish.yml');
  assert.deepEqual(config.on.push.tags, ['v0.2.*']);
  assert.deepEqual(config.permissions, { contents: 'write', packages: 'write' });
  assert.deepEqual(Object.keys(config.jobs), ['publish']);
  const job = config.jobs.publish;
  assert.equal(job.steps.find((step) => step.uses?.startsWith('actions/checkout@')).with?.['fetch-depth'], 0);
  assertVerification(job);
  const run = commands(job);
  assert.ok(run.indexOf('node scripts/verify-maintenance-release.mjs') < run.indexOf('npm ci'));
  assert.ok(run.indexOf('node scripts/verify-yaml-security.mjs') < run.indexOf('npm publish'));
  assert.match(run, /npm publish "\$tarball" --tag maintenance-0\.2/);
  assert.match(run, /gh release create "\$TAG" "\$tarball" --verify-tag --latest=false/);
});

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function fixture(t, { tagged = true } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'editor-maintenance-guard-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const origin = join(directory, 'origin.git');
  const source = join(directory, 'source');
  git(directory, 'init', '--bare', origin);
  git(directory, 'init', '--initial-branch=release/0.2.x', source);
  git(source, 'config', 'user.name', 'Maintenance Guard Test');
  git(source, 'config', 'user.email', 'maintenance@example.invalid');
  git(source, 'config', 'commit.gpgSign', 'false');
  git(source, 'config', 'tag.gpgSign', 'false');
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: '@gocodealone/workflow-editor', version: '0.2.1' }));
  git(source, 'add', 'package.json');
  git(source, 'commit', '-m', 'fixture');
  git(source, 'remote', 'add', 'origin', origin);
  git(source, 'push', 'origin', 'HEAD:refs/heads/release/0.2.x');
  if (tagged) git(source, 'tag', 'v0.2.1');
  return source;
}

function invoke(source, tag) {
  return spawnSync(process.execPath, [guard, tag], { cwd: source, encoding: 'utf8' });
}

test('actual release guard accepts matching remote branch, package, tag and checkout', (t) => {
  const source = fixture(t);
  const result = invoke(source, 'v0.2.1');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    tag: 'v0.2.1', version: '0.2.1', gitHead: git(source, 'rev-parse', 'HEAD'),
  });
});

for (const tag of ['v0.85.5', 'v0.2.01', 'v0.2.1-rc.1', '--help']) {
  test(`actual guard rejects noncanonical or wrong-line tag ${tag}`, (t) => {
    const result = invoke(fixture(t), tag);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /maintenance release refused: invalid maintenance tag/);
  });
}

test('actual guard rejects a package/tag version mismatch', (t) => {
  const source = fixture(t);
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: '@gocodealone/workflow-editor', version: '0.2.2' }));
  const result = invoke(source, 'v0.2.1');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /maintenance release refused: package identity does not match tag/);
});

test('actual guard rejects a checkout different from the peeled tag', (t) => {
  const source = fixture(t);
  git(source, 'commit', '--allow-empty', '-m', 'later');
  const result = invoke(source, 'v0.2.1');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /maintenance release refused: checkout does not match tag/);
});

test('actual guard rejects a tag absent from remote maintenance ancestry', (t) => {
  const source = fixture(t, { tagged: false });
  git(source, 'commit', '--allow-empty', '-m', 'not pushed');
  git(source, 'tag', 'v0.2.1');
  const result = invoke(source, 'v0.2.1');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /maintenance release refused: tag is not on remote maintenance branch/);
});

test('actual guard rejects tracked bytes different from the verified checkout', (t) => {
  const source = fixture(t);
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: '@gocodealone/workflow-editor', version: '0.2.1', altered: true }));
  const result = invoke(source, 'v0.2.1');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /maintenance release refused: checkout is not clean/);
});
