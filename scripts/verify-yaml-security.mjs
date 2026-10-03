import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// This function runs in children rooted in the extracted package, never the source checkout.
async function consumePackage() {
  const assert = (await import('node:assert/strict')).default;
  const { createRequire } = await import('node:module');
  const { realpathSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const format = process.argv[1];
  const require = createRequire(import.meta.url);
  const specifier = '@gocodealone/workflow-editor/utils';
  const resolved = format === 'ESM' ? fileURLToPath(import.meta.resolve(specifier)) : require.resolve(specifier);
  assert.equal(realpathSync(resolved), realpathSync(join(process.cwd(), `dist/utils/index.${format === 'ESM' ? 'js' : 'cjs'}`)), 'consumer must resolve the extracted public export');
  const utils = format === 'ESM' ? await import(specifier) : require(specifier);
  const failures = [];
  let assertions = 0;
  for (const name of ['parseYaml', 'multiConfigToTabs']) {
    assert.equal(typeof utils[name], 'function', `missing ${name} export`);
    function inputFor(tenant = 'tenant-alpha', resource = 'resource-first', merges = 0) {
      const config = `modules:\n  - name: ${tenant}-${resource}\n    type: http.server\n    config:\n      address: '127.0.0.1:0'\nworkflows: {}\ntriggers: {}\n`;
      const body = name === 'parseYaml' ? config : `workflows:\n  - name: ${tenant}-${resource}\n${config.split('\n').map((line) => `    ${line}`).join('\n')}`;
      if (!merges) return body;
      return `base: &empty {}\npayload:\n${Array.from({ length: merges }, (_, i) => `  m${i}: {<<: *empty}`).join('\n')}\n${body}`;
    }
    function representation(input, tenant = 'tenant-alpha', resource = 'resource-first') {
      const moduleName = `${tenant}-${resource}`;
      const parsed = utils[name](input);
      if (name === 'parseYaml') {
        assert.deepEqual(parsed, { modules: [{ name: moduleName, type: 'http.server', config: { address: '127.0.0.1:0' } }], workflows: {}, triggers: {} });
      } else {
        assert.equal(parsed.length, 1);
        assert.equal(parsed[0].name, moduleName);
        assert.equal(parsed[0].nodes.length, 1);
        assert.deepEqual(parsed[0].nodes[0].data.config, { address: '127.0.0.1:0' });
        assert.equal(parsed[0].nodes[0].data.label, moduleName);
        assert.equal(parsed[0].nodes[0].data.moduleType, 'http.server');
        assert.deepEqual(parsed[0].edges, []);
      }
    }
    const cases = [
      ['tenant-alpha/resource-first', () => representation(inputFor())],
      ['tenant-beta/resource-second', () => representation(inputFor('tenant-beta', 'resource-second'), 'tenant-beta', 'resource-second')],
      ['malformed YAML', () => assert.throws(() => utils[name]('workflows: [\n'), /unexpected end|end of the stream/i)],
      ['10,000 merge boundary', () => representation(inputFor(undefined, undefined, 10_000))],
      ['10,001 merge budget', () => {
        const hostile = inputFor(undefined, undefined, 10_001);
        assert(hostile.length < 256_000);
        assert.throws(() => utils[name](hostile), /merge keys exceeded maxTotalMergeKeys \(10000\)/);
      }],
    ];
    for (const [label, check] of cases) {
      try { check(); assertions++; } catch (error) { failures.push(`${format} ${name} ${label}: ${error.message}`); }
    }
  }
  assert.equal(failures.length, 0, failures.join('\n'));
  console.log(`${format}: both real utils exports PASS (${assertions} cases)`);
}

function verify(tarballPath, expectedHead) {
  assert.match(expectedHead, /^[a-f0-9]{40}$/, 'expected HEAD must be a full verified commit');
  const tarball = resolve(tarballPath);
  assert(lstatSync(tarball).isFile(), 'tarball must be a regular file');
  const names = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split('\n');
  assert(names.every((name) => name.startsWith('package/') && !name.split('/').includes('..')), 'archive entries must stay inside package/');
  const types = execFileSync('tar', ['-tvzf', tarball], { encoding: 'utf8' }).trim().split('\n');
  assert(types.every((line) => /^[d-]/.test(line)), 'archive must contain only regular files/directories');
  const extraction = realpathSync(mkdtempSync(join(tmpdir(), 'editor-yaml-consumer-')));
  try {
    execFileSync('tar', ['-xzf', tarball, '-C', extraction]);
    const packageDirectory = join(extraction, 'package');
    const manifest = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'));
    assert.equal(manifest.name, '@gocodealone/workflow-editor', 'packed package identity');
    assert.equal(manifest.version, '0.2.1', 'packed version');
    assert.equal(manifest.gitHead, expectedHead, 'packed gitHead');
    const checkout = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const peers = join(checkout, 'node_modules');
    assert(lstatSync(peers).isDirectory() || lstatSync(peers).isSymbolicLink(), 'owned installed dependencies required');
    symlinkSync(peers, join(packageDirectory, 'node_modules'), 'dir');
    const failures = [];
    for (const format of ['ESM', 'CJS']) {
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `(${consumePackage.toString()})().catch((error) => { console.error(error.message); process.exitCode = 1; });`, format], { cwd: packageDirectory, encoding: 'utf8', timeout: 20_000 });
      if (result.error || result.status !== 0) failures.push(`${format}: ${result.error?.message || result.stderr}`);
      else process.stdout.write(result.stdout);
    }
    assert.equal(failures.length, 0, failures.join('\n'));
    console.log(`Packed identity PASS: ${manifest.version} ${manifest.gitHead}`);
  } finally {
    rmSync(extraction, { recursive: true, force: true });
  }
}

try {
  assert.equal(process.argv.length, 4, 'Usage: node scripts/verify-yaml-security.mjs <tarball> <expected-head>');
  verify(process.argv[2], process.argv[3]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
