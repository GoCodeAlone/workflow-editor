import { describe, it, expect } from 'vitest';
import { configToNodes, exportToFiles, resolveImports } from './serialization.ts';
import { MODULE_TYPE_MAP } from '../types/workflow.ts';
import { readFileSync } from 'fs';
import { resolve as resolveFsPath } from 'path';

/** Load a fixture file from test-fixtures/multifile-nested/. */
function loadFixture(name: string): string {
  return readFileSync(
    resolveFsPath(__dirname, '../../test-fixtures/multifile-nested', name),
    'utf-8',
  );
}

const FIXTURE_APP = loadFixture('app.yaml');
const FIXTURE_PLATFORM = loadFixture('platform/platform.yaml');
const FIXTURE_CORE = loadFixture('platform/core/core.yaml');
const FIXTURE_DATABASE = loadFixture('platform/core/database.yaml');
const FIXTURE_CACHE = loadFixture('platform/core/cache.yaml');
const FIXTURE_FEATURES = loadFixture('platform/features/features.yaml');
const FIXTURE_AUTH = loadFixture('platform/features/auth.yaml');
const FIXTURE_PAYMENTS = loadFixture('platform/features/payments.yaml');

function makeResolver(files: Record<string, string>) {
  return async (path: string): Promise<string | null> => files[path] ?? null;
}

const ALL_FILES: Record<string, string> = {
  'platform/platform.yaml': FIXTURE_PLATFORM,
  'platform/core/core.yaml': FIXTURE_CORE,
  'platform/core/database.yaml': FIXTURE_DATABASE,
  'platform/core/cache.yaml': FIXTURE_CACHE,
  'platform/features/features.yaml': FIXTURE_FEATURES,
  'platform/features/auth.yaml': FIXTURE_AUTH,
  'platform/features/payments.yaml': FIXTURE_PAYMENTS,
};

describe('nested-directory multi-file config — resolveImports', () => {
  const resolver = makeResolver(ALL_FILES);

  it('resolves modules across 3+ levels of nesting', async () => {
    const { config, error } = await resolveImports(FIXTURE_APP, resolver);
    expect(error).toBeUndefined();
    const names = config.modules.map((m) => m.name);
    // From platform/core/database.yaml (3 levels deep)
    expect(names).toContain('primary-db');
    expect(names).toContain('replica-db');
    // From platform/core/cache.yaml (3 levels deep)
    expect(names).toContain('redis-cache');
    // From platform/features/auth.yaml (3 levels deep)
    expect(names).toContain('auth-service');
    // From platform/features/payments.yaml (3 levels deep)
    expect(names).toContain('payment-gateway');
  });

  it('sourceMap uses full relative paths from root', async () => {
    const { sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    expect(sourceMap.get('primary-db')).toBe('platform/core/database.yaml');
    expect(sourceMap.get('replica-db')).toBe('platform/core/database.yaml');
    expect(sourceMap.get('redis-cache')).toBe('platform/core/cache.yaml');
    expect(sourceMap.get('auth-service')).toBe('platform/features/auth.yaml');
    expect(sourceMap.get('payment-gateway')).toBe('platform/features/payments.yaml');
  });

  it('tracks pipelines from nested feature files', async () => {
    const { sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    expect(sourceMap.get('pipeline:login')).toBe('platform/features/auth.yaml');
    expect(sourceMap.get('pipeline:register')).toBe('platform/features/auth.yaml');
    expect(sourceMap.get('pipeline:charge')).toBe('platform/features/payments.yaml');
    expect(sourceMap.get('pipeline:refund')).toBe('platform/features/payments.yaml');
  });

  it('handles intermediate aggregator files with no modules', async () => {
    const { config } = await resolveImports(FIXTURE_APP, resolver);
    // platform.yaml, core.yaml, features.yaml are pure aggregators — no modules of their own
    // All 5 modules come from leaf files only
    expect(config.modules.length).toBe(5);
  });

  it('preserves application name and version', async () => {
    const { config } = await resolveImports(FIXTURE_APP, resolver);
    expect(config.name).toBe('nested-platform');
    expect(config.version).toBe('2.0.0');
  });

  it('does not duplicate modules', async () => {
    const { config } = await resolveImports(FIXTURE_APP, resolver);
    const names = config.modules.map((m) => m.name);
    expect(names.length).toBe(new Set(names).size);
  });
});

describe('nested-directory multi-file config — exportToFiles round-trip', () => {
  const resolver = makeResolver(ALL_FILES);

  it('leaf modules stay in leaf files', async () => {
    const { config, sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    const fileMap = exportToFiles(config, sourceMap);

    expect(fileMap.get('platform/core/database.yaml')).toContain('primary-db');
    expect(fileMap.get('platform/core/database.yaml')).toContain('replica-db');
    expect(fileMap.get('platform/core/cache.yaml')).toContain('redis-cache');
    expect(fileMap.get('platform/features/auth.yaml')).toContain('auth-service');
    expect(fileMap.get('platform/features/payments.yaml')).toContain('payment-gateway');
  });

  it('pipelines stay in their feature files', async () => {
    const { config, sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    const fileMap = exportToFiles(config, sourceMap);

    const authYaml = fileMap.get('platform/features/auth.yaml')!;
    expect(authYaml).toContain('login');
    expect(authYaml).toContain('register');

    const payYaml = fileMap.get('platform/features/payments.yaml')!;
    expect(payYaml).toContain('charge');
    expect(payYaml).toContain('refund');
  });

  it('main file references only top-level import', async () => {
    const { config, sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    const fileMap = exportToFiles(config, sourceMap);
    const mainYaml = fileMap.get(null)!;

    expect(mainYaml).toContain('imports:');
    expect(mainYaml).toMatch(/^modules:\s*\[\]/m);
    // All modules are in imported files
    expect(mainYaml).not.toContain('primary-db');
    expect(mainYaml).not.toContain('auth-service');
  });

  it('no cross-file bleed between feature files', async () => {
    const { config, sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    const fileMap = exportToFiles(config, sourceMap);

    const authYaml = fileMap.get('platform/features/auth.yaml')!;
    expect(authYaml).not.toContain('payment-gateway');
    expect(authYaml).not.toContain('charge');

    const payYaml = fileMap.get('platform/features/payments.yaml')!;
    expect(payYaml).not.toContain('auth-service');
    expect(payYaml).not.toContain('login');
  });
});

describe('nested-directory multi-file config — error handling', () => {
  it('missing leaf file reports error but resolves siblings', async () => {
    // Remove payments.yaml from the resolver
    const partialFiles = { ...ALL_FILES };
    delete partialFiles['platform/features/payments.yaml'];
    const resolver = makeResolver(partialFiles);

    const { config, error } = await resolveImports(FIXTURE_APP, resolver);
    expect(error).toBeTruthy();
    // Auth modules and pipelines from auth.yaml should still resolve
    const names = config.modules.map((m) => m.name);
    expect(names).toContain('auth-service');
    expect(names).toContain('primary-db');
    // Payment modules should not be present
    expect(names).not.toContain('payment-gateway');
  });
});

describe('nested-directory multi-file config — configToNodes', () => {
  const resolver = makeResolver(ALL_FILES);

  it('creates module nodes with full nested paths as sourceFile', async () => {
    const { config, sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    const { nodes } = configToNodes(config, MODULE_TYPE_MAP, sourceMap);

    const moduleNodes = nodes.filter((n) => !n.data.synthesized);
    expect(moduleNodes.length).toBe(5);

    const dbNode = moduleNodes.find((n) => n.data.label === 'primary-db');
    expect(dbNode?.data.sourceFile).toBe('platform/core/database.yaml');

    const authNode = moduleNodes.find((n) => n.data.label === 'auth-service');
    expect(authNode?.data.sourceFile).toBe('platform/features/auth.yaml');
  });
});
