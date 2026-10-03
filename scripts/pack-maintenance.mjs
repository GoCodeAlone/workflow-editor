import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { constants, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function gitHead() {
  try {
    const head = execFileSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], { cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    assert.match(head, /^[a-f0-9]{40}$/);
    return head;
  } catch {
    throw new Error('Cannot verify checkout Git HEAD');
  }
}

function pack(outputDirectory) {
  const head = gitHead();
  const sourceBytes = readFileSync(join(checkout, 'package.json'));
  const manifest = JSON.parse(sourceBytes);
  assert.equal(manifest.name, '@gocodealone/workflow-editor', 'source package identity');
  assert.equal(manifest.version, '0.2.1', 'source package identity');
  const dist = join(checkout, 'dist');
  assert(lstatSync(dist).isDirectory(), 'dist must be a built directory');
  for (const entry of ['dist/utils/index.js', 'dist/utils/index.cjs']) {
    assert(existsSync(join(checkout, entry)) && lstatSync(join(checkout, entry)).isFile(), `missing built export ${entry}`);
  }
  const output = resolve(outputDirectory);
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const stage = mkdtempSync(join(tmpdir(), 'editor-maintenance-pack-'));
  try {
    cpSync(dist, join(stage, 'dist'), {
      recursive: true,
      filter(source) {
        const stat = lstatSync(source);
        assert(stat.isDirectory() || stat.isFile(), 'dist must contain only regular files/directories');
        return true;
      },
    });
    writeFileSync(join(stage, 'package.json'), `${JSON.stringify({ ...manifest, gitHead: head }, null, 2)}\n`);
    assert.equal(gitHead(), head, 'Git HEAD changed during staging');
    assert.deepEqual(readFileSync(join(checkout, 'package.json')), sourceBytes, 'source manifest changed during staging');
    const result = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts'], { cwd: stage, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    assert.equal(result.length, 1, 'npm must return one packed artifact');
    const filename = 'gocodealone-workflow-editor-0.2.1.tgz';
    assert.equal(result[0].filename, filename, 'unexpected npm artifact filename');
    const stagedTarball = join(stage, filename);
    const packed = JSON.parse(execFileSync('tar', ['-xOf', stagedTarball, 'package/package.json'], { encoding: 'utf8' }));
    assert.equal(packed.version, manifest.version, 'packed version');
    assert.equal(packed.gitHead, head, 'packed gitHead');
    assert.equal(gitHead(), head, 'Git HEAD changed during packing');
    assert.deepEqual(readFileSync(join(checkout, 'package.json')), sourceBytes, 'source manifest changed during packing');
    const tarball = join(output, filename);
    copyFileSync(stagedTarball, tarball, constants.COPYFILE_EXCL);
    return { tarball, gitHead: head, version: packed.version, integrity: result[0].integrity };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

try {
  assert.equal(process.argv.length, 3, 'Usage: node scripts/pack-maintenance.mjs <output-directory>');
  console.log(JSON.stringify(pack(process.argv[2])));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
