import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceManifest = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'));

function fixture(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'editor-pack-test-')));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const checkout = join(directory, 'checkout');
  mkdirSync(join(checkout, 'scripts'), { recursive: true });
  for (const script of ['pack-maintenance.mjs', 'verify-yaml-security.mjs']) {
    if (existsSync(join(project, 'scripts', script))) cpSync(join(project, 'scripts', script), join(checkout, 'scripts', script));
  }
  cpSync(join(project, 'dist'), join(checkout, 'dist'), { recursive: true });
  writeFileSync(join(checkout, 'package.json'), JSON.stringify({ ...sourceManifest, version: '0.2.1' }, null, 2));
  writeFileSync(join(checkout, 'not-for-publication.txt'), 'private fixture marker');
  symlinkSync(join(project, 'node_modules'), join(checkout, 'node_modules'), 'dir');
  execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: checkout });
  execFileSync('git', ['add', 'package.json', 'dist'], { cwd: checkout });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '--no-gpg-sign', '-m', 'fixture'], { cwd: checkout });
  return { checkout, directory, output: join(directory, 'output'), head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim() };
}

function run(checkout, script, ...args) {
  const result = spawnSync(process.execPath, [join(checkout, 'scripts', script), ...args], { cwd: checkout, encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.error, undefined, 'CLI must finish, not time out');
  return result;
}

function packedManifest(tarball) {
  return JSON.parse(execFileSync('tar', ['-xOf', tarball, 'package/package.json'], { encoding: 'utf8' }));
}

test('packer stamps actual Git HEAD, preserves source bytes, and packs only actual dist/manifest', (t) => {
  const f = fixture(t);
  const before = readFileSync(join(f.checkout, 'package.json'));
  const result = run(f.checkout, 'pack-maintenance.mjs', f.output);
  assert.equal(result.status, 0, result.stderr);
  const proof = JSON.parse(result.stdout);
  const tarball = proof.tarball;
  assert.equal(proof.gitHead, f.head);
  assert.equal(proof.version, '0.2.1');
  assert.equal(tarball, join(f.output, 'gocodealone-workflow-editor-0.2.1.tgz'));
  const manifest = packedManifest(tarball);
  assert.equal(manifest.version, '0.2.1');
  assert.equal(manifest.gitHead, f.head);
  assert.deepEqual(readFileSync(join(f.checkout, 'package.json')), before);
  assert.deepEqual(execFileSync('tar', ['-xOf', tarball, 'package/dist/utils/index.js']), readFileSync(join(f.checkout, 'dist/utils/index.js')));
  const entries = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split('\n');
  assert(entries.every((entry) => entry === 'package/package.json' || entry.startsWith('package/dist/')));
  assert.deepEqual(Object.keys(manifest.exports), Object.keys(sourceManifest.exports));
});

for (const [name, damage, pattern] of [
  ['missing dist', (f) => rmSync(join(f.checkout, 'dist'), { recursive: true }), /dist/],
  ['missing built export', (f) => rmSync(join(f.checkout, 'dist/utils/index.cjs')), /built export/],
  ['non-Git checkout', (f) => rmSync(join(f.checkout, '.git'), { recursive: true }), /Git HEAD/],
  ['invalid manifest', (f) => writeFileSync(join(f.checkout, 'package.json'), '{'), /JSON/],
  ['wrong package identity', (f) => writeFileSync(join(f.checkout, 'package.json'), JSON.stringify({ ...sourceManifest, name: 'not-the-editor', version: '0.2.1' })), /package identity/],
  ['wrong package version', (f) => writeFileSync(join(f.checkout, 'package.json'), JSON.stringify({ ...sourceManifest, version: '0.3.0' })), /package identity/],
  ['linked dist content', (f) => symlinkSync(join(f.checkout, 'not-for-publication.txt'), join(f.checkout, 'dist/linked-secret')), /regular files/],
]) {
  test(`packer rejects ${name}`, (t) => {
    const f = fixture(t);
    damage(f);
    const result = run(f.checkout, 'pack-maintenance.mjs', f.output);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, pattern);
    assert(!existsSync(join(f.output, 'gocodealone-workflow-editor-0.2.1.tgz')));
  });
}

test('packer rejects missing output argument', (t) => {
  const f = fixture(t);
  const result = run(f.checkout, 'pack-maintenance.mjs');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage:/);
});

test('packer does not overwrite caller files', (t) => {
  const f = fixture(t);
  mkdirSync(f.output);
  const destination = join(f.output, 'gocodealone-workflow-editor-0.2.1.tgz');
  writeFileSync(destination, 'caller-owned');
  const result = run(f.checkout, 'pack-maintenance.mjs', f.output);
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(destination, 'utf8'), 'caller-owned');
});

for (const [name, change, pattern] of [
  ['wrong version', (m) => ({ ...m, version: '0.2.0' }), /packed version/],
  ['missing version', (m) => { const { version, ...rest } = m; assert(version); return rest; }, /packed version/],
  ['wrong HEAD', (m) => ({ ...m, gitHead: '0'.repeat(40) }), /packed gitHead/],
  ['missing HEAD', (m) => { const { gitHead, ...rest } = m; assert(gitHead); return rest; }, /packed gitHead/],
]) {
  test(`packed probe rejects ${name} before invoking parsers`, (t) => {
    const f = fixture(t);
    const packed = run(f.checkout, 'pack-maintenance.mjs', f.output);
    assert.equal(packed.status, 0, packed.stderr);
    const stage = join(f.directory, 'repack');
    mkdirSync(stage);
    execFileSync('tar', ['-xzf', JSON.parse(packed.stdout).tarball, '-C', stage]);
    const manifestFile = join(stage, 'package/package.json');
    writeFileSync(manifestFile, JSON.stringify(change(JSON.parse(readFileSync(manifestFile, 'utf8')))));
    // npm rejects missing version metadata, so corrupt the actual packed archive directly.
    const corruptedTarball = join(stage, 'corrupted.tgz');
    execFileSync('tar', ['-czf', corruptedTarball, '-C', stage, 'package']);
    const result = run(f.checkout, 'verify-yaml-security.mjs', corruptedTarball, f.head);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, pattern);
    assert.doesNotMatch(result.stderr, /merge budget|ERR_MODULE_NOT_FOUND/);
  });
}

test('packed probe rejects invalid expected HEAD', (t) => {
  const f = fixture(t);
  const result = run(f.checkout, 'verify-yaml-security.mjs', join(f.directory, 'missing.tgz'), 'not-a-commit');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /expected HEAD/);
});
