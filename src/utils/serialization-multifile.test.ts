import { describe, it, expect } from 'vitest';
import { configToNodes, exportToFiles } from './serialization.ts';
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
