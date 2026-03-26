import { describe, it, expect } from 'vitest';
import { configToNodes, exportToFiles, resolveImports } from './serialization.ts';
import { MODULE_TYPE_MAP } from '../types/workflow.ts';
import { readFileSync } from 'fs';
import { resolve as resolveFsPath } from 'path';

/** Load a fixture file from test-fixtures/multifile-domain/. */
function loadFixture(name: string): string {
  return readFileSync(
    resolveFsPath(__dirname, '../../test-fixtures/multifile-domain', name),
    'utf-8',
  );
}

const FIXTURE_APP = loadFixture('app.yaml');
const FIXTURE_AUTH = loadFixture('domains/auth.yaml');
const FIXTURE_BILLING = loadFixture('domains/billing.yaml');
const FIXTURE_NOTIFICATIONS = loadFixture('domains/notifications.yaml');
const FIXTURE_INFRA = loadFixture('shared/infra.yaml');

function makeResolver(files: Record<string, string>) {
  return async (path: string): Promise<string | null> => files[path] ?? null;
}

const ALL_FILES: Record<string, string> = {
  'domains/auth.yaml': FIXTURE_AUTH,
  'domains/billing.yaml': FIXTURE_BILLING,
  'domains/notifications.yaml': FIXTURE_NOTIFICATIONS,
  'shared/infra.yaml': FIXTURE_INFRA,
};

describe('domain-split multi-file config — resolveImports', () => {
  const resolver = makeResolver(ALL_FILES);

  it('resolves all modules across domain files and shared infra', async () => {
    const { config, error } = await resolveImports(FIXTURE_APP, resolver);
    expect(error).toBeUndefined();
    const names = config.modules.map((m) => m.name);
    // auth domain
    expect(names).toContain('auth-db');
    expect(names).toContain('auth-cache');
    // billing domain
    expect(names).toContain('billing-db');
    expect(names).toContain('stripe');
    // notifications domain
    expect(names).toContain('email-svc');
    expect(names).toContain('sms-svc');
    // shared infra
    expect(names).toContain('http-server');
    expect(names).toContain('router');
    expect(names).toContain('logger');
  });

  it('assigns correct sourceFile for every module', async () => {
    const { sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    expect(sourceMap.get('auth-db')).toBe('domains/auth.yaml');
    expect(sourceMap.get('auth-cache')).toBe('domains/auth.yaml');
    expect(sourceMap.get('billing-db')).toBe('domains/billing.yaml');
    expect(sourceMap.get('stripe')).toBe('domains/billing.yaml');
    expect(sourceMap.get('email-svc')).toBe('domains/notifications.yaml');
    expect(sourceMap.get('sms-svc')).toBe('domains/notifications.yaml');
    expect(sourceMap.get('http-server')).toBe('shared/infra.yaml');
    expect(sourceMap.get('router')).toBe('shared/infra.yaml');
    expect(sourceMap.get('logger')).toBe('shared/infra.yaml');
  });

  it('tracks all pipelines in sourceMap', async () => {
    const { sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    expect(sourceMap.get('pipeline:login')).toBe('domains/auth.yaml');
    expect(sourceMap.get('pipeline:register')).toBe('domains/auth.yaml');
    expect(sourceMap.get('pipeline:charge')).toBe('domains/billing.yaml');
    expect(sourceMap.get('pipeline:refund')).toBe('domains/billing.yaml');
    expect(sourceMap.get('pipeline:send-email')).toBe('domains/notifications.yaml');
    expect(sourceMap.get('pipeline:send-sms')).toBe('domains/notifications.yaml');
  });

  it('merges workflows from main file', async () => {
    const { config } = await resolveImports(FIXTURE_APP, resolver);
    expect(config.workflows).toHaveProperty('http');
  });

  it('preserves application name and version', async () => {
    const { config } = await resolveImports(FIXTURE_APP, resolver);
    expect(config.name).toBe('my-platform');
    expect(config.version).toBe('3.0.0');
  });

  it('does not duplicate modules', async () => {
    const { config } = await resolveImports(FIXTURE_APP, resolver);
    const names = config.modules.map((m) => m.name);
    const unique = new Set(names);
    expect(names.length).toBe(unique.size);
  });
});

describe('domain-split multi-file config — exportToFiles round-trip', () => {
  const resolver = makeResolver(ALL_FILES);

  it('routes modules to correct domain files', async () => {
    const { config, sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    const fileMap = exportToFiles(config, sourceMap);

    const authYaml = fileMap.get('domains/auth.yaml')!;
    expect(authYaml).toContain('auth-db');
    expect(authYaml).toContain('auth-cache');

    const billingYaml = fileMap.get('domains/billing.yaml')!;
    expect(billingYaml).toContain('billing-db');
    expect(billingYaml).toContain('stripe');

    const notifyYaml = fileMap.get('domains/notifications.yaml')!;
    expect(notifyYaml).toContain('email-svc');
    expect(notifyYaml).toContain('sms-svc');

    const infraYaml = fileMap.get('shared/infra.yaml')!;
    expect(infraYaml).toContain('http-server');
    expect(infraYaml).toContain('router');
    expect(infraYaml).toContain('logger');
  });

  it('routes pipelines to correct domain files', async () => {
    const { config, sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    const fileMap = exportToFiles(config, sourceMap);

    const authYaml = fileMap.get('domains/auth.yaml')!;
    expect(authYaml).toContain('login');
    expect(authYaml).toContain('register');

    const billingYaml = fileMap.get('domains/billing.yaml')!;
    expect(billingYaml).toContain('charge');
    expect(billingYaml).toContain('refund');

    const notifyYaml = fileMap.get('domains/notifications.yaml')!;
    expect(notifyYaml).toContain('send-email');
    expect(notifyYaml).toContain('send-sms');
  });

  it('main file has imports but no domain modules or pipelines', async () => {
    const { config, sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    const fileMap = exportToFiles(config, sourceMap);
    const mainYaml = fileMap.get(null)!;

    expect(mainYaml).toContain('imports:');
    expect(mainYaml).toContain('workflows:');
    // All modules belong to imported files, so main file modules list is empty
    expect(mainYaml).toMatch(/^modules:\s*\[\]/m);
    // No pipelines in main file
    expect(mainYaml).not.toMatch(/^pipelines:/m);
  });

  it('no cross-file bleed — auth modules do not appear in billing file', async () => {
    const { config, sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    const fileMap = exportToFiles(config, sourceMap);

    const billingYaml = fileMap.get('domains/billing.yaml')!;
    expect(billingYaml).not.toContain('auth-db');
    expect(billingYaml).not.toContain('auth-cache');

    const authYaml = fileMap.get('domains/auth.yaml')!;
    expect(authYaml).not.toContain('billing-db');
    expect(authYaml).not.toContain('stripe');
  });

  it('editing a domain module keeps it in its domain file', async () => {
    const { config, sourceMap } = await resolveImports(FIXTURE_APP, resolver);

    // Simulate renaming auth-db to auth-database
    const updatedConfig = {
      ...config,
      modules: config.modules.map((m) =>
        m.name === 'auth-db' ? { ...m, name: 'auth-database' } : m,
      ),
    };
    const updatedSourceMap = new Map(sourceMap);
    updatedSourceMap.delete('auth-db');
    updatedSourceMap.set('auth-database', 'domains/auth.yaml');

    const fileMap = exportToFiles(updatedConfig, updatedSourceMap);
    expect(fileMap.get('domains/auth.yaml')).toContain('auth-database');
    expect(fileMap.get(null)).not.toContain('auth-database');
  });
});

describe('domain-split multi-file config — configToNodes', () => {
  const resolver = makeResolver(ALL_FILES);

  it('creates nodes for all modules with correct sourceFile', async () => {
    const { config, sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    const { nodes } = configToNodes(config, MODULE_TYPE_MAP, sourceMap);

    // Module nodes (non-synthesized)
    const moduleNodes = nodes.filter((n) => !n.data.synthesized);
    expect(moduleNodes.length).toBe(9); // 2+2+2+3 modules across all files

    const authDbNode = moduleNodes.find((n) => n.data.label === 'auth-db');
    expect(authDbNode?.data.sourceFile).toBe('domains/auth.yaml');

    const httpServerNode = moduleNodes.find((n) => n.data.label === 'http-server');
    expect(httpServerNode?.data.sourceFile).toBe('shared/infra.yaml');
  });

  it('creates edges for HTTP routes connecting to pipeline handlers', async () => {
    const { config, sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    const { edges } = configToNodes(config, MODULE_TYPE_MAP, sourceMap);

    // Should have http-route edges connecting routes to pipeline handlers
    const routeEdges = edges.filter((e) => {
      const data = e.data as Record<string, unknown> | undefined;
      return data?.edgeType === 'http-route';
    });
    expect(routeEdges.length).toBeGreaterThan(0);
  });
});
