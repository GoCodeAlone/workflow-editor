import { describe, it, expect } from 'vitest';
import { configToNodes, exportToFiles, resolveImports } from './serialization.ts';
import { MODULE_TYPE_MAP } from '../types/workflow.ts';
import type { WorkflowConfig } from '../types/workflow.ts';

describe('partial config with sourceMap renders all nodes', () => {
  it('creates nodes for all modules and attaches sourceFile from sourceMap', () => {
    const config: WorkflowConfig = {
      modules: [
        { name: 'http-server', type: 'http.server', config: { port: 8080 } },
        { name: 'router', type: 'http.router', config: {} },
      ],
      workflows: { http: { router: 'router', server: 'http-server', routes: [] } },
      triggers: {},
      pipelines: {
        'auth-register': {
          steps: [
            { name: 'validate', type: 'step.validate' },
            { name: 'insert', type: 'step.db_exec' },
          ],
        },
      },
    };
    const sourceMap = new Map([
      ['http-server', 'config/modules.yaml'],
      ['router', 'config/modules.yaml'],
      ['auth-register', 'pipelines/auth.yaml'],
    ]);

    const { nodes } = configToNodes(config, MODULE_TYPE_MAP, sourceMap);

    // All module nodes should be created
    expect(nodes.length).toBeGreaterThan(0);
    const moduleNodes = nodes.filter((n) => !n.data.synthesized);
    expect(moduleNodes.length).toBe(2);

    // Module nodes should have sourceFile in data
    const serverNode = moduleNodes.find((n) => n.data.label === 'http-server');
    const routerNode = moduleNodes.find((n) => n.data.label === 'router');
    expect(serverNode?.data.sourceFile).toBe('config/modules.yaml');
    expect(routerNode?.data.sourceFile).toBe('config/modules.yaml');
  });

  it('nodes without sourceMap entry have no sourceFile', () => {
    const config: WorkflowConfig = {
      modules: [
        { name: 'db', type: 'database.postgres', config: {} },
        { name: 'cache', type: 'nosql.redis', config: {} },
      ],
      workflows: {},
      triggers: {},
    };
    const sourceMap = new Map([['db', 'infra/db.yaml']]);
    const { nodes } = configToNodes(config, MODULE_TYPE_MAP, sourceMap);

    const dbNode = nodes.find((n) => n.data.label === 'db');
    const cacheNode = nodes.find((n) => n.data.label === 'cache');
    expect(dbNode?.data.sourceFile).toBe('infra/db.yaml');
    expect(cacheNode?.data.sourceFile).toBeUndefined();
  });
});

describe('exportToFiles splits config by sourceMap', () => {
  it('routes modules to their source files', () => {
    const config: WorkflowConfig = {
      modules: [
        { name: 'http-server', type: 'http.server', config: { port: 8080 } },
        { name: 'router', type: 'http.router', config: {} },
        { name: 'db', type: 'database.postgres', config: {} },
      ],
      workflows: { http: { router: 'router', server: 'http-server', routes: [] } },
      triggers: {},
    };
    const sourceMap = new Map([
      ['http-server', 'config/http.yaml'],
      ['router', 'config/http.yaml'],
      // db has no entry -> goes to main file
    ]);

    const result = exportToFiles(config, sourceMap);

    expect(result.has(null)).toBe(true);
    expect(result.has('config/http.yaml')).toBe(true);

    const mainYaml = result.get(null)!;
    const importedYaml = result.get('config/http.yaml')!;

    // Main file has db module and workflows
    expect(mainYaml).toContain('database.postgres');
    expect(mainYaml).toContain('workflows:');
    // Imported file has http modules
    expect(importedYaml).toContain('http-server');
    expect(importedYaml).toContain('router');
    // Main file references the imported file
    expect(mainYaml).toContain('imports:');
    expect(mainYaml).toContain('config/http.yaml');
  });

  it('routes pipelines to their source files', () => {
    const config: WorkflowConfig = {
      modules: [],
      workflows: {},
      triggers: {},
      pipelines: {
        'auth-register': { steps: [{ name: 'validate', type: 'step.validate' }] },
        'user-update': { steps: [{ name: 'update', type: 'step.db_exec' }] },
      },
    };
    const sourceMap = new Map([
      ['auth-register', 'pipelines/auth.yaml'],
      // user-update has no entry -> goes to main
    ]);

    const result = exportToFiles(config, sourceMap);

    const mainYaml = result.get(null)!;
    const authYaml = result.get('pipelines/auth.yaml')!;

    expect(mainYaml).toContain('user-update');
    expect(authYaml).toContain('auth-register');
    expect(mainYaml).not.toContain('auth-register');
  });
});

describe('partial file without workspace shows pipeline steps', () => {
  it('creates synthesized step nodes for pipeline-only configs', () => {
    const config: WorkflowConfig = {
      modules: [],
      workflows: {},
      triggers: {},
      pipelines: {
        'my-pipeline': {
          steps: [
            { name: 'validate', type: 'step.validate' },
            { name: 'insert', type: 'step.db_exec' },
          ],
        },
      },
    };

    const { nodes, edges } = configToNodes(config, MODULE_TYPE_MAP);

    // Should render pipeline step nodes, not blank canvas
    expect(nodes.length).toBe(2);
    expect(nodes[0].data.label).toBe('validate');
    expect(nodes[1].data.label).toBe('insert');

    // All nodes are synthesized (excluded from module export)
    expect(nodes.every((n) => n.data.synthesized)).toBe(true);

    // Steps are connected by pipeline-flow edges
    expect(edges.length).toBeGreaterThan(0);
    const flowEdge = edges.find((e) => (e.data as Record<string, unknown>)?.edgeType === 'pipeline-flow');
    expect(flowEdge).toBeDefined();
    expect(flowEdge!.source).toBe(nodes[0].id);
    expect(flowEdge!.target).toBe(nodes[1].id);
  });

  it('creates nodes for multiple pipelines', () => {
    const config: WorkflowConfig = {
      modules: [],
      workflows: {},
      triggers: {},
      pipelines: {
        'pipeline-a': {
          steps: [{ name: 'step-a1', type: 'step.set' }],
        },
        'pipeline-b': {
          steps: [
            { name: 'step-b1', type: 'step.set' },
            { name: 'step-b2', type: 'step.set' },
          ],
        },
      },
    };

    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);
    expect(nodes.length).toBe(3); // 1 + 2
  });

  it('does not create pipeline view nodes when modules are present', () => {
    const config: WorkflowConfig = {
      modules: [{ name: 'server', type: 'http.server', config: { port: 8080 } }],
      workflows: {},
      triggers: {},
      pipelines: {
        'my-pipeline': {
          steps: [{ name: 'step1', type: 'step.set' }],
        },
      },
    };

    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);
    // Only the real module node, no synthesized pipeline view nodes
    const synthesized = nodes.filter((n) => n.data.synthesized);
    expect(synthesized.length).toBe(0);
    expect(nodes.length).toBe(1);
  });
});

describe('name and version preserved in multi-file export', () => {
  it('root config name and version appear in main file output', () => {
    const config: WorkflowConfig = {
      name: 'my-service',
      version: '1.2.3',
      modules: [
        { name: 'server', type: 'http.server', config: { port: 8080 } },
        { name: 'module-b', type: 'database.postgres', config: {} },
      ],
      workflows: {},
      triggers: {},
    };
    const sourceMap = new Map([['module-b', 'infra/db.yaml']]);

    const result = exportToFiles(config, sourceMap);
    const mainYaml = result.get(null)!;

    expect(mainYaml).toContain('name: my-service');
    expect(mainYaml).toContain('version:');
    expect(mainYaml).toContain('1.2.3');
  });

  it('name and version are not added to imported files', () => {
    const config: WorkflowConfig = {
      name: 'my-service',
      version: '2.0.0',
      modules: [
        { name: 'db', type: 'database.postgres', config: {} },
      ],
      workflows: {},
      triggers: {},
    };
    const sourceMap = new Map([['db', 'infra/db.yaml']]);

    const result = exportToFiles(config, sourceMap);
    const importedYaml = result.get('infra/db.yaml')!;

    // Should not have top-level name/version (the field is at root level, not indented)
    expect(importedYaml).not.toMatch(/^name:/m);
    expect(importedYaml).not.toMatch(/^version:/m);
  });
});

// ---------------------------------------------------------------------------
// resolveImports — complex multi-file fixture scenarios
// ---------------------------------------------------------------------------

// Fixture files mirroring test-fixtures/multifile/
const FIXTURE_MAIN = `
application:
  name: my-platform
  version: 2.0.0
  workflows:
    - file: base.yaml
    - file: api.yaml
`.trim();

const FIXTURE_BASE = `
# Base infrastructure — embeds the database layer
imports:
  - database.yaml

modules:
  - name: cache
    type: nosql.redis
    config:
      host: localhost
      port: 6379
`.trim();

const FIXTURE_DATABASE = `
modules:
  - name: db
    type: database.postgres
    config:
      host: localhost
      port: 5432
      database: myapp
`.trim();

const FIXTURE_API = `
modules:
  - name: http-server
    type: http.server
    config:
      port: 8080
  - name: router
    type: http.router
    config: {}

workflows:
  http:
    server: http-server
    router: router
    routes:
      - method: POST
        path: /api/users
        handler: user-create

pipelines:
  user-create:
    steps:
      - name: validate
        type: step.validate
      - name: insert
        type: step.db_exec
  user-get:
    steps:
      - name: fetch
        type: step.db_exec
`.trim();

/** Build a simple in-memory resolver from a path→content map. */
function makeResolver(files: Record<string, string>) {
  return async (path: string): Promise<string | null> => files[path] ?? null;
}

describe('resolveImports — complex nested multi-file scenario', () => {
  const resolver = makeResolver({
    'base.yaml': FIXTURE_BASE,
    'database.yaml': FIXTURE_DATABASE,
    'api.yaml': FIXTURE_API,
  });

  it('resolves all modules across three levels of nesting', async () => {
    const { config, error } = await resolveImports(FIXTURE_MAIN, resolver);
    expect(error).toBeUndefined();
    const names = config.modules.map((m) => m.name);
    expect(names).toContain('cache');       // from base.yaml
    expect(names).toContain('db');          // from database.yaml (nested import inside base.yaml)
    expect(names).toContain('http-server'); // from api.yaml
    expect(names).toContain('router');      // from api.yaml
  });

  it('assigns correct sourceFile for every module in sourceMap', async () => {
    const { sourceMap } = await resolveImports(FIXTURE_MAIN, resolver);
    expect(sourceMap.get('cache')).toBe('base.yaml');
    expect(sourceMap.get('db')).toBe('database.yaml');
    expect(sourceMap.get('http-server')).toBe('api.yaml');
    expect(sourceMap.get('router')).toBe('api.yaml');
  });

  it('tracks pipelines in sourceMap so they round-trip to their source file', async () => {
    const { sourceMap } = await resolveImports(FIXTURE_MAIN, resolver);
    expect(sourceMap.get('user-create')).toBe('api.yaml');
    expect(sourceMap.get('user-get')).toBe('api.yaml');
  });

  it('merges workflows from imported files', async () => {
    const { config } = await resolveImports(FIXTURE_MAIN, resolver);
    expect(config.workflows).toHaveProperty('http');
  });

  it('preserves application name and version from application: section', async () => {
    const { config } = await resolveImports(FIXTURE_MAIN, resolver);
    expect(config.name).toBe('my-platform');
    expect(config.version).toBe('2.0.0');
  });

  it('does not duplicate modules that appear in multiple imports', async () => {
    const { config } = await resolveImports(FIXTURE_MAIN, resolver);
    const names = config.modules.map((m) => m.name);
    const unique = new Set(names);
    expect(names.length).toBe(unique.size);
  });
});

describe('resolveImports — pipeline sourceMap enables correct round-trip export', () => {
  it('pipelines round-trip to their source file via exportToFiles', async () => {
    const resolver = makeResolver({
      'api.yaml': FIXTURE_API,
      'base.yaml': FIXTURE_BASE,
      'database.yaml': FIXTURE_DATABASE,
    });
    const { config, sourceMap } = await resolveImports(FIXTURE_MAIN, resolver);

    const fileMap = exportToFiles(config, sourceMap);

    // Pipelines belong to api.yaml — they must NOT appear as a pipelines: block in the main file
    const mainYaml = fileMap.get(null)!;
    expect(mainYaml).not.toMatch(/^pipelines:/m);

    // Pipelines must appear in api.yaml's output
    const apiYaml = fileMap.get('api.yaml')!;
    expect(apiYaml).toMatch(/^pipelines:/m);
    expect(apiYaml).toContain('user-create');
    expect(apiYaml).toContain('user-get');
  });

  it('modules round-trip to their source file via exportToFiles', async () => {
    const resolver = makeResolver({
      'api.yaml': FIXTURE_API,
      'base.yaml': FIXTURE_BASE,
      'database.yaml': FIXTURE_DATABASE,
    });
    const { config, sourceMap } = await resolveImports(FIXTURE_MAIN, resolver);

    const fileMap = exportToFiles(config, sourceMap);

    // Main file modules list must be empty (all modules belong to imported files)
    const mainYaml = fileMap.get(null)!;
    expect(mainYaml).toMatch(/^modules:\s*\[\]/m);

    // Modules appear in their respective source files
    expect(fileMap.get('api.yaml')).toContain('http-server');
    expect(fileMap.get('base.yaml')).toContain('cache');
    expect(fileMap.get('database.yaml')).toContain('db');
  });

  it('main file references imported files rather than inlining them', async () => {
    const resolver = makeResolver({
      'api.yaml': FIXTURE_API,
      'base.yaml': FIXTURE_BASE,
      'database.yaml': FIXTURE_DATABASE,
    });
    const { config, sourceMap } = await resolveImports(FIXTURE_MAIN, resolver);

    const fileMap = exportToFiles(config, sourceMap);
    const mainYaml = fileMap.get(null)!;

    // Main file should reference imported files, not inline their content
    expect(mainYaml).toContain('imports:');
    // Each imported file path must appear as a reference
    const importedFiles = ['api.yaml', 'base.yaml', 'database.yaml'];
    const hasAtLeastOneRef = importedFiles.some((f) => mainYaml.includes(f));
    expect(hasAtLeastOneRef).toBe(true);
  });
});

describe('resolveImports — editing a node routes the change to the correct file', () => {
  it('after renaming a module, exportToFiles puts it in the same source file', async () => {
    const resolver = makeResolver({
      'api.yaml': FIXTURE_API,
      'base.yaml': FIXTURE_BASE,
      'database.yaml': FIXTURE_DATABASE,
    });
    const { config, sourceMap } = await resolveImports(FIXTURE_MAIN, resolver);

    // Simulate renaming 'cache' (from base.yaml) to 'cache-v2'
    const updatedConfig: WorkflowConfig = {
      ...config,
      modules: config.modules.map((m) =>
        m.name === 'cache' ? { ...m, name: 'cache-v2' } : m,
      ),
    };
    // Update sourceMap to reflect the rename
    const updatedSourceMap = new Map(sourceMap);
    updatedSourceMap.delete('cache');
    updatedSourceMap.set('cache-v2', 'base.yaml');

    const fileMap = exportToFiles(updatedConfig, updatedSourceMap);

    // The renamed module should appear in base.yaml, not in main
    expect(fileMap.get('base.yaml')).toContain('cache-v2');
    expect(fileMap.get(null)).not.toContain('cache-v2');
  });

  it('after modifying a pipeline step, exportToFiles keeps it in the source file', async () => {
    const resolver = makeResolver({
      'api.yaml': FIXTURE_API,
      'base.yaml': FIXTURE_BASE,
      'database.yaml': FIXTURE_DATABASE,
    });
    const { config, sourceMap } = await resolveImports(FIXTURE_MAIN, resolver);

    // Simulate adding a step to the user-create pipeline
    const updatedConfig: WorkflowConfig = {
      ...config,
      pipelines: {
        ...config.pipelines,
        'user-create': {
          steps: [
            { name: 'validate', type: 'step.validate' },
            { name: 'auth-check', type: 'step.set' },
            { name: 'insert', type: 'step.db_exec' },
          ],
        },
      },
    };

    const fileMap = exportToFiles(updatedConfig, sourceMap);

    // Modified pipeline must stay in api.yaml
    const apiYaml = fileMap.get('api.yaml')!;
    expect(apiYaml).toContain('auth-check');
    // Must NOT bleed into main file
    expect(fileMap.get(null)).not.toContain('auth-check');
  });
});

describe('resolveImports — cycle detection and error handling', () => {
  it('handles circular imports gracefully without infinite loop', async () => {
    const circularResolver = makeResolver({
      'a.yaml': 'imports:\n  - b.yaml\nmodules:\n  - name: mod-a\n    type: http.server\n    config: {}',
      'b.yaml': 'imports:\n  - a.yaml\nmodules:\n  - name: mod-b\n    type: database.postgres\n    config: {}',
    });
    const mainWithCircular = 'imports:\n  - a.yaml';
    // Should not hang or throw
    const { config } = await resolveImports(mainWithCircular, circularResolver);
    const names = config.modules.map((m) => m.name);
    expect(names).toContain('mod-a');
    expect(names).toContain('mod-b');
  });

  it('reports missing files as errors but still merges what is available', async () => {
    const partialResolver = makeResolver({ 'api.yaml': FIXTURE_API });
    const { config, error } = await resolveImports(FIXTURE_MAIN, partialResolver);
    // Some error about missing files
    expect(error).toBeTruthy();
    // But api.yaml modules/pipelines are still present
    const names = config.modules.map((m) => m.name);
    expect(names).toContain('http-server');
  });
});

describe('resolveImports — imports: path also tracks pipelines in sourceMap', () => {
  it('pipelines from an imports: file get correct sourceMap entries', async () => {
    const mainYaml = `
imports:
  - feature-a.yaml
`.trim();
    const featureAYaml = `
modules:
  - name: svc-a
    type: http.server
    config:
      port: 9000
pipelines:
  pipeline-a:
    steps:
      - name: step1
        type: step.validate
`.trim();
    const { sourceMap } = await resolveImports(
      mainYaml,
      makeResolver({ 'feature-a.yaml': featureAYaml }),
    );
    expect(sourceMap.get('svc-a')).toBe('feature-a.yaml');
    expect(sourceMap.get('pipeline-a')).toBe('feature-a.yaml');
  });
});
