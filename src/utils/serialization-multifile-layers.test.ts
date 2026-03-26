import { describe, it, expect } from 'vitest';
import { configToNodes, exportToFiles, resolveImports } from './serialization.ts';
import { MODULE_TYPE_MAP } from '../types/workflow.ts';
import { readFileSync } from 'fs';
import { resolve as resolveFsPath } from 'path';

/** Load a fixture file from test-fixtures/multifile-layers/. */
function loadFixture(name: string): string {
  return readFileSync(
    resolveFsPath(__dirname, '../../test-fixtures/multifile-layers', name),
    'utf-8',
  );
}

const FIXTURE_APP = loadFixture('app.yaml');
const FIXTURE_INFRA = loadFixture('layers/infrastructure.yaml');
const FIXTURE_MIDDLEWARE = loadFixture('layers/middleware.yaml');
const FIXTURE_SERVICES = loadFixture('layers/services.yaml');
const FIXTURE_API = loadFixture('layers/api.yaml');

function makeResolver(files: Record<string, string>) {
  return async (path: string): Promise<string | null> => files[path] ?? null;
}

const ALL_FILES: Record<string, string> = {
  'layers/infrastructure.yaml': FIXTURE_INFRA,
  'layers/middleware.yaml': FIXTURE_MIDDLEWARE,
  'layers/services.yaml': FIXTURE_SERVICES,
  'layers/api.yaml': FIXTURE_API,
};

describe('layer-split multi-file config — resolveImports', () => {
  const resolver = makeResolver(ALL_FILES);

  it('resolves modules from infrastructure and api layers', async () => {
    const { config, error } = await resolveImports(FIXTURE_APP, resolver);
    expect(error).toBeUndefined();
    const names = config.modules.map((m) => m.name);
    // infrastructure layer
    expect(names).toContain('primary-db');
    expect(names).toContain('cache');
    expect(names).toContain('message-queue');
    expect(names).toContain('logger');
    // api layer
    expect(names).toContain('http-server');
    expect(names).toContain('router');
  });

  it('resolves pipelines from middleware and services layers', async () => {
    const { config } = await resolveImports(FIXTURE_APP, resolver);
    const pipelineNames = Object.keys(config.pipelines ?? {});
    // middleware layer
    expect(pipelineNames).toContain('auth-middleware');
    expect(pipelineNames).toContain('rate-limit');
    expect(pipelineNames).toContain('cors');
    // services layer
    expect(pipelineNames).toContain('user-service');
    expect(pipelineNames).toContain('order-service');
    expect(pipelineNames).toContain('product-service');
  });

  it('sourceMap assigns correct layer file for each module', async () => {
    const { sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    expect(sourceMap.get('primary-db')).toBe('layers/infrastructure.yaml');
    expect(sourceMap.get('cache')).toBe('layers/infrastructure.yaml');
    expect(sourceMap.get('message-queue')).toBe('layers/infrastructure.yaml');
    expect(sourceMap.get('logger')).toBe('layers/infrastructure.yaml');
    expect(sourceMap.get('http-server')).toBe('layers/api.yaml');
    expect(sourceMap.get('router')).toBe('layers/api.yaml');
  });

  it('sourceMap assigns correct layer file for each pipeline', async () => {
    const { sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    expect(sourceMap.get('pipeline:auth-middleware')).toBe('layers/middleware.yaml');
    expect(sourceMap.get('pipeline:rate-limit')).toBe('layers/middleware.yaml');
    expect(sourceMap.get('pipeline:cors')).toBe('layers/middleware.yaml');
    expect(sourceMap.get('pipeline:user-service')).toBe('layers/services.yaml');
    expect(sourceMap.get('pipeline:order-service')).toBe('layers/services.yaml');
    expect(sourceMap.get('pipeline:product-service')).toBe('layers/services.yaml');
  });

  it('preserves application name and version', async () => {
    const { config } = await resolveImports(FIXTURE_APP, resolver);
    expect(config.name).toBe('layered-app');
    expect(config.version).toBe('1.0.0');
  });

  it('does not duplicate modules', async () => {
    const { config } = await resolveImports(FIXTURE_APP, resolver);
    const names = config.modules.map((m) => m.name);
    expect(names.length).toBe(new Set(names).size);
  });
});

describe('layer-split multi-file config — exportToFiles round-trip', () => {
  const resolver = makeResolver(ALL_FILES);

  it('modules stay in their layer file', async () => {
    const { config, sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    const fileMap = exportToFiles(config, sourceMap);

    const infraYaml = fileMap.get('layers/infrastructure.yaml')!;
    expect(infraYaml).toContain('primary-db');
    expect(infraYaml).toContain('cache');
    expect(infraYaml).toContain('message-queue');
    expect(infraYaml).toContain('logger');

    const apiYaml = fileMap.get('layers/api.yaml')!;
    expect(apiYaml).toContain('http-server');
    expect(apiYaml).toContain('router');
  });

  it('pipelines stay in their layer file', async () => {
    const { config, sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    const fileMap = exportToFiles(config, sourceMap);

    const mwYaml = fileMap.get('layers/middleware.yaml')!;
    expect(mwYaml).toContain('auth-middleware');
    expect(mwYaml).toContain('rate-limit');
    expect(mwYaml).toContain('cors');

    const svcYaml = fileMap.get('layers/services.yaml')!;
    expect(svcYaml).toContain('user-service');
    expect(svcYaml).toContain('order-service');
    expect(svcYaml).toContain('product-service');
  });

  it('main file only has application metadata and imports', async () => {
    const { config, sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    const fileMap = exportToFiles(config, sourceMap);
    const mainYaml = fileMap.get(null)!;

    expect(mainYaml).toContain('imports:');
    expect(mainYaml).toMatch(/^modules:\s*\[\]/m);
    expect(mainYaml).not.toMatch(/^pipelines:/m);
  });

  it('no cross-layer bleed', async () => {
    const { config, sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    const fileMap = exportToFiles(config, sourceMap);

    // Infrastructure modules should not appear in middleware file
    const mwYaml = fileMap.get('layers/middleware.yaml')!;
    expect(mwYaml).not.toContain('primary-db');
    expect(mwYaml).not.toContain('http-server');

    // Middleware pipelines should not appear in services file
    const svcYaml = fileMap.get('layers/services.yaml')!;
    expect(svcYaml).not.toContain('auth-middleware');
    expect(svcYaml).not.toContain('rate-limit');
  });
});

describe('layer-split multi-file config — configToNodes', () => {
  const resolver = makeResolver(ALL_FILES);

  it('creates module nodes with correct sourceFile', async () => {
    const { config, sourceMap } = await resolveImports(FIXTURE_APP, resolver);
    const { nodes } = configToNodes(config, MODULE_TYPE_MAP, sourceMap);

    const moduleNodes = nodes.filter((n) => !n.data.synthesized);
    expect(moduleNodes.length).toBe(6); // 4 infra + 2 api

    const dbNode = moduleNodes.find((n) => n.data.label === 'primary-db');
    expect(dbNode?.data.sourceFile).toBe('layers/infrastructure.yaml');
  });
});
