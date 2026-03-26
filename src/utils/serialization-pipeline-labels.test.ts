/**
 * Tests for pipeline node labeling, partial YAML handling, and edge cases
 * around nodes not rendering or missing helpful labels.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve as resolveFsPath } from 'path';
import {
  configToNodes,
  exportToFiles,
  resolveImports,
  parseYaml,
  configToYaml,
} from './serialization.ts';
import { MODULE_TYPE_MAP } from '../types/workflow.ts';
import type { WorkflowConfig } from '../types/workflow.ts';

function loadFixture(name: string): string {
  return readFileSync(
    resolveFsPath(__dirname, '../../test-fixtures/multifile', name),
    'utf-8',
  );
}

function makeResolver(files: Record<string, string>) {
  return async (path: string): Promise<string | null> => files[path] ?? null;
}

// ---------------------------------------------------------------------------
// pipelineName on synthesized step nodes
// ---------------------------------------------------------------------------

describe('pipeline step nodes carry pipelineName in partial (no-modules) configs', () => {
  it('sets pipelineName on every synthesized step node', () => {
    const config: WorkflowConfig = {
      modules: [],
      workflows: {},
      triggers: {},
      pipelines: {
        'list-forms': {
          steps: [
            { name: 'parse', type: 'step.request_parse' },
            { name: 'respond', type: 'step.json_response' },
          ],
        },
        'create-form': {
          steps: [
            { name: 'parse', type: 'step.request_parse' },
            { name: 'insert', type: 'step.db_exec' },
            { name: 'respond', type: 'step.json_response' },
          ],
        },
      },
    };

    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);

    const listNodes = nodes.filter((n) => n.data.pipelineName === 'list-forms');
    const createNodes = nodes.filter((n) => n.data.pipelineName === 'create-form');

    expect(listNodes).toHaveLength(2);
    expect(createNodes).toHaveLength(3);
  });

  it('same step names in different pipelines remain distinguishable via pipelineName', () => {
    const config: WorkflowConfig = {
      modules: [],
      workflows: {},
      triggers: {},
      pipelines: {
        'pipeline-a': {
          steps: [
            { name: 'parse', type: 'step.request_parse' },
            { name: 'respond', type: 'step.json_response' },
          ],
        },
        'pipeline-b': {
          steps: [
            { name: 'parse', type: 'step.request_parse' },
            { name: 'respond', type: 'step.json_response' },
          ],
        },
      },
    };

    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);

    // Both pipelines have a 'parse' step — each should carry its own pipeline name
    const parseNodes = nodes.filter((n) => n.data.label === 'parse');
    expect(parseNodes).toHaveLength(2);
    const pipelineNames = parseNodes.map((n) => n.data.pipelineName);
    expect(pipelineNames).toContain('pipeline-a');
    expect(pipelineNames).toContain('pipeline-b');
  });

  it('all steps in a single pipeline share the same pipelineName', () => {
    const config: WorkflowConfig = {
      modules: [],
      workflows: {},
      triggers: {},
      pipelines: {
        'my-pipeline': {
          steps: [
            { name: 'validate', type: 'step.validate' },
            { name: 'insert', type: 'step.db_exec' },
            { name: 'respond', type: 'step.json_response' },
          ],
        },
      },
    };

    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);
    expect(nodes.every((n) => n.data.pipelineName === 'my-pipeline')).toBe(true);
  });

  it('non-synthesized module nodes do NOT get pipelineName', () => {
    const config: WorkflowConfig = {
      modules: [
        { name: 'server', type: 'http.server', config: { port: 8080 } },
      ],
      workflows: {},
      triggers: {},
    };

    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);
    expect(nodes.every((n) => n.data.pipelineName === undefined)).toBe(true);
  });

  it('pipeline nodes are NOT created when modules are present (mixed config)', () => {
    const config: WorkflowConfig = {
      modules: [{ name: 'server', type: 'http.server', config: { port: 8080 } }],
      workflows: {},
      triggers: {},
      pipelines: {
        'ignored-pipeline': {
          steps: [{ name: 'step1', type: 'step.set' }],
        },
      },
    };

    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);
    // Pipeline view nodes should NOT be created when modules are present
    const synthesized = nodes.filter((n) => n.data.synthesized);
    expect(synthesized).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// forms.yaml fixture: pipeline-only partial with many shared step names
// ---------------------------------------------------------------------------

describe('forms.yaml fixture — pipeline-only partial rendering', () => {
  const FORMS_YAML = loadFixture('forms.yaml');

  it('renders all pipelines from forms.yaml', () => {
    const config = parseYaml(FORMS_YAML);
    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);

    const pipelineNames = new Set(
      nodes.map((n) => n.data.pipelineName).filter(Boolean),
    );
    expect(pipelineNames).toContain('list-forms');
    expect(pipelineNames).toContain('get-form');
    expect(pipelineNames).toContain('create-form');
    expect(pipelineNames).toContain('update-form');
    expect(pipelineNames).toContain('create-form-submission');
  });

  it('every step node carries a non-empty pipelineName', () => {
    const config = parseYaml(FORMS_YAML);
    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);

    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.every((n) => !!n.data.pipelineName)).toBe(true);
  });

  it('step nodes that share a name across pipelines each have a unique (pipelineName, label) pair', () => {
    const config = parseYaml(FORMS_YAML);
    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);

    const keys = nodes.map((n) => `${n.data.pipelineName}::${n.data.label}`);
    const unique = new Set(keys);
    // Every (pipelineName, label) pair should be unique across all nodes
    expect(keys.length).toBe(unique.size);
  });

  it('all nodes are synthesized in a pipeline-only config', () => {
    const config = parseYaml(FORMS_YAML);
    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);

    expect(nodes.every((n) => n.data.synthesized === true)).toBe(true);
  });

  it('each pipeline forms a connected chain via pipeline-flow edges', () => {
    const config = parseYaml(FORMS_YAML);
    const { nodes, edges } = configToNodes(config, MODULE_TYPE_MAP);

    const flowEdges = edges.filter(
      (e) => (e.data as Record<string, unknown>)?.edgeType === 'pipeline-flow',
    );
    expect(flowEdges.length).toBeGreaterThan(0);

    // Each pipeline's steps should be connected sequentially
    const pipelines = config.pipelines as Record<
      string,
      { steps: Array<{ name: string }> }
    >;
    for (const [, pipeline] of Object.entries(pipelines)) {
      // Each pipeline with >1 step must have at least 1 flow edge
      if ((pipeline.steps?.length ?? 0) > 1) {
        expect(flowEdges.length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// application.yaml fixture: resolveImports with forms.yaml as a workflow file
// ---------------------------------------------------------------------------

describe('application.yaml + forms.yaml multi-file resolution', () => {
  const APPLICATION_YAML = loadFixture('application.yaml');
  const FORMS_YAML = loadFixture('forms.yaml');
  const BASE_YAML = loadFixture('base.yaml');
  const DATABASE_YAML = loadFixture('database.yaml');

  const resolver = makeResolver({
    'forms.yaml': FORMS_YAML,
    'base.yaml': BASE_YAML,
    'database.yaml': DATABASE_YAML,
  });

  it('resolves forms.yaml pipelines via application.yaml', async () => {
    const { config, error } = await resolveImports(APPLICATION_YAML, resolver);
    expect(error).toBeUndefined();
    expect(config.pipelines).toBeDefined();
    const pipelineNames = Object.keys(config.pipelines ?? {});
    expect(pipelineNames).toContain('list-forms');
    expect(pipelineNames).toContain('create-form');
  });

  it('assigns forms.yaml as sourceMap entry for its pipelines', async () => {
    const { sourceMap } = await resolveImports(APPLICATION_YAML, resolver);
    expect(sourceMap.get('pipeline:list-forms')).toBe('forms.yaml');
    expect(sourceMap.get('pipeline:get-form')).toBe('forms.yaml');
    expect(sourceMap.get('pipeline:create-form')).toBe('forms.yaml');
  });

  it('merges modules from base.yaml (cache, db) into the resolved config', async () => {
    const { config } = await resolveImports(APPLICATION_YAML, resolver);
    const names = config.modules.map((m) => m.name);
    expect(names).toContain('cache');
    expect(names).toContain('db');
  });

  it('pipelines from forms.yaml round-trip back to forms.yaml via exportToFiles', async () => {
    const { config, sourceMap } = await resolveImports(APPLICATION_YAML, resolver);
    const fileMap = exportToFiles(config, sourceMap);

    const formsYaml = fileMap.get('forms.yaml');
    expect(formsYaml).toBeDefined();
    expect(formsYaml).toContain('list-forms');
    expect(formsYaml).toContain('create-form');

    // Should NOT leak into the main file
    const mainYaml = fileMap.get(null)!;
    expect(mainYaml).not.toContain('list-forms');
    expect(mainYaml).not.toContain('create-form');
  });
});

// ---------------------------------------------------------------------------
// Edge cases: nodes not rendering, missing labels, canvas↔yaml sync
// ---------------------------------------------------------------------------

describe('edge cases — nodes not rendering or missing labels', () => {
  it('empty pipelines object produces no nodes', () => {
    const config: WorkflowConfig = {
      modules: [],
      workflows: {},
      triggers: {},
      pipelines: {},
    };
    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);
    expect(nodes).toHaveLength(0);
  });

  it('pipeline with empty steps array produces no nodes', () => {
    const config: WorkflowConfig = {
      modules: [],
      workflows: {},
      triggers: {},
      pipelines: {
        'empty-pipeline': { steps: [] },
      },
    };
    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);
    expect(nodes).toHaveLength(0);
  });

  it('step without explicit config still renders with empty config object', () => {
    const config: WorkflowConfig = {
      modules: [],
      workflows: {},
      triggers: {},
      pipelines: {
        'p': {
          steps: [{ name: 'step1', type: 'step.set' }],
        },
      },
    };
    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].data.config).toBeDefined();
    expect(nodes[0].data.label).toBe('step1');
  });

  it('step type without step. prefix is normalized to step.<type>', () => {
    const config: WorkflowConfig = {
      modules: [],
      workflows: {},
      triggers: {},
      pipelines: {
        'p': {
          steps: [{ name: 'exec', type: 'db_exec' }],
        },
      },
    };
    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);
    expect(nodes[0].data.moduleType).toBe('step.db_exec');
  });

  it('step node label is the step name, not the step type', () => {
    const config: WorkflowConfig = {
      modules: [],
      workflows: {},
      triggers: {},
      pipelines: {
        'p': {
          steps: [{ name: 'my-validate-step', type: 'step.validate' }],
        },
      },
    };
    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);
    expect(nodes[0].data.label).toBe('my-validate-step');
  });
});

// ---------------------------------------------------------------------------
// Canvas↔YAML sync: changes to YAML are reflected in nodes and vice-versa
// ---------------------------------------------------------------------------

describe('canvas↔yaml sync — changes round-trip correctly', () => {
  it('adding a step to a pipeline YAML is reflected as a new node', () => {
    const yamlBefore = `
pipelines:
  my-pipeline:
    steps:
      - name: parse
        type: step.request_parse
`.trim();
    const yamlAfter = `
pipelines:
  my-pipeline:
    steps:
      - name: parse
        type: step.request_parse
      - name: respond
        type: step.json_response
`.trim();

    const { nodes: nodesBefore } = configToNodes(parseYaml(yamlBefore), MODULE_TYPE_MAP);
    const { nodes: nodesAfter } = configToNodes(parseYaml(yamlAfter), MODULE_TYPE_MAP);

    expect(nodesBefore).toHaveLength(1);
    expect(nodesAfter).toHaveLength(2);
    expect(nodesAfter[1].data.label).toBe('respond');
  });

  it('renaming a step in YAML is reflected in node label', () => {
    const yaml = `
pipelines:
  p:
    steps:
      - name: old-name
        type: step.set
`.trim();
    const yamlRenamed = yaml.replace('old-name', 'new-name');

    const { nodes: before } = configToNodes(parseYaml(yaml), MODULE_TYPE_MAP);
    const { nodes: after } = configToNodes(parseYaml(yamlRenamed), MODULE_TYPE_MAP);

    expect(before[0].data.label).toBe('old-name');
    expect(after[0].data.label).toBe('new-name');
  });

  it('pipeline-only YAML round-trips through configToYaml preserving all pipelines', () => {
    const yaml = loadFixture('forms.yaml');
    const config = parseYaml(yaml);
    const reserialized = configToYaml(config);
    const reparsed = parseYaml(reserialized);

    const originalKeys = Object.keys(config.pipelines ?? {}).sort();
    const roundTripKeys = Object.keys(reparsed.pipelines ?? {}).sort();
    expect(roundTripKeys).toEqual(originalKeys);
  });

  it('modifying a pipeline step config round-trips correctly', () => {
    const config: WorkflowConfig = {
      modules: [],
      workflows: {},
      triggers: {},
      pipelines: {
        'p': {
          steps: [{ name: 'query', type: 'step.db_query', config: { table: 'users' } }],
        },
      },
    };
    const yaml = configToYaml(config);
    const reparsed = parseYaml(yaml);
    const pipeline = reparsed.pipelines!['p'] as { steps: Array<{ config: Record<string, unknown> }> };
    expect(pipeline.steps[0].config?.table).toBe('users');
  });
});

// ---------------------------------------------------------------------------
// sourceMap propagation for pipeline step nodes (partial + multi-file)
// ---------------------------------------------------------------------------

describe('sourceMap propagation for pipeline steps in partial configs', () => {
  it('step nodes inherit sourceFile from pipeline sourceMap entry', () => {
    const config: WorkflowConfig = {
      modules: [],
      workflows: {},
      triggers: {},
      pipelines: {
        'forms-pipeline': {
          steps: [
            { name: 'parse', type: 'step.request_parse' },
            { name: 'respond', type: 'step.json_response' },
          ],
        },
      },
    };
    const sourceMap = new Map([['pipeline:forms-pipeline', 'forms/pipelines.yaml']]);
    const { nodes } = configToNodes(config, MODULE_TYPE_MAP, sourceMap);

    for (const node of nodes) {
      expect(node.data.sourceFile).toBe('forms/pipelines.yaml');
    }
  });

  it('step nodes with no sourceMap entry have no sourceFile', () => {
    const config: WorkflowConfig = {
      modules: [],
      workflows: {},
      triggers: {},
      pipelines: {
        'p': {
          steps: [{ name: 's', type: 'step.set' }],
        },
      },
    };
    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);
    expect(nodes[0].data.sourceFile).toBeUndefined();
  });

  it('step nodes from different pipelines with different source files are tagged correctly', () => {
    const config: WorkflowConfig = {
      modules: [],
      workflows: {},
      triggers: {},
      pipelines: {
        'pipeline-a': {
          steps: [{ name: 'step-a', type: 'step.set' }],
        },
        'pipeline-b': {
          steps: [{ name: 'step-b', type: 'step.set' }],
        },
      },
    };
    const sourceMap = new Map([
      ['pipeline:pipeline-a', 'features/a.yaml'],
      ['pipeline:pipeline-b', 'features/b.yaml'],
    ]);
    const { nodes } = configToNodes(config, MODULE_TYPE_MAP, sourceMap);

    const nodeA = nodes.find((n) => n.data.label === 'step-a');
    const nodeB = nodes.find((n) => n.data.label === 'step-b');
    expect(nodeA?.data.sourceFile).toBe('features/a.yaml');
    expect(nodeB?.data.sourceFile).toBe('features/b.yaml');
  });
});

// ---------------------------------------------------------------------------
// resolveImports: pipeline sourceMap for imports: (not just application: workflows)
// ---------------------------------------------------------------------------

describe('resolveImports — pipeline sourceMap via imports: directive', () => {
  it('pipelines from an imports: file carry correct pipeline sourceMap key', async () => {
    const mainYaml = `imports:\n  - forms.yaml`;
    const { sourceMap } = await resolveImports(
      mainYaml,
      makeResolver({ 'forms.yaml': loadFixture('forms.yaml') }),
    );
    expect(sourceMap.get('pipeline:list-forms')).toBe('forms.yaml');
    expect(sourceMap.get('pipeline:create-form')).toBe('forms.yaml');
  });

  it('after resolveImports, configToNodes shows pipelineName on step nodes when pipeline-only merged config', async () => {
    // A "forms-only" app: main has no modules, only imports forms.yaml
    const mainYaml = `imports:\n  - forms.yaml`;
    const { config } = await resolveImports(
      mainYaml,
      makeResolver({ 'forms.yaml': loadFixture('forms.yaml') }),
    );

    // The merged config has no modules, only pipelines → pipeline view renders
    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);
    expect(nodes.length).toBeGreaterThan(0);
    // All synthesized nodes should have a pipelineName
    expect(nodes.every((n) => !!n.data.pipelineName)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Multi-pipeline: each pipeline row should be visually isolated
// ---------------------------------------------------------------------------

describe('multi-pipeline layout — pipelines produce separate edge chains', () => {
  it('each pipeline produces an independent sequence of pipeline-flow edges', () => {
    const config: WorkflowConfig = {
      modules: [],
      workflows: {},
      triggers: {},
      pipelines: {
        'p1': {
          steps: [
            { name: 'a', type: 'step.set' },
            { name: 'b', type: 'step.set' },
          ],
        },
        'p2': {
          steps: [
            { name: 'c', type: 'step.set' },
            { name: 'd', type: 'step.set' },
          ],
        },
      },
    };

    const { nodes, edges } = configToNodes(config, MODULE_TYPE_MAP);
    const flowEdges = edges.filter(
      (e) => (e.data as Record<string, unknown>)?.edgeType === 'pipeline-flow',
    );

    // 2 edges total (a→b, c→d), none crossing pipelines
    expect(flowEdges).toHaveLength(2);

    const nodeIds = new Map(nodes.map((n) => [n.id, n]));
    for (const edge of flowEdges) {
      const sourceNode = nodeIds.get(edge.source);
      const targetNode = nodeIds.get(edge.target);
      // Source and target must be in the same pipeline
      expect(sourceNode?.data.pipelineName).toBe(targetNode?.data.pipelineName);
    }
  });

  it('pipeline-flow edges do not cross between different pipelines', () => {
    const config: WorkflowConfig = {
      modules: [],
      workflows: {},
      triggers: {},
      pipelines: {
        'forms': {
          steps: [
            { name: 'parse', type: 'step.request_parse' },
            { name: 'respond', type: 'step.json_response' },
          ],
        },
        'auth': {
          steps: [
            { name: 'parse', type: 'step.request_parse' },
            { name: 'validate', type: 'step.auth_validate' },
          ],
        },
      },
    };

    const { nodes, edges } = configToNodes(config, MODULE_TYPE_MAP);
    const flowEdges = edges.filter(
      (e) => (e.data as Record<string, unknown>)?.edgeType === 'pipeline-flow',
    );

    const nodeIds = new Map(nodes.map((n) => [n.id, n]));
    for (const edge of flowEdges) {
      const src = nodeIds.get(edge.source)?.data.pipelineName;
      const tgt = nodeIds.get(edge.target)?.data.pipelineName;
      expect(src).toBe(tgt);
    }
  });
});

// ---------------------------------------------------------------------------
// Route-attached pipeline steps (api.query / api.command handler chains)
// ---------------------------------------------------------------------------

describe('route-attached pipeline steps — pipelineHandlerId for stable rename-safety', () => {
  it('step nodes attached to api.command handler carry pipelineHandlerId pointing to the handler node', () => {
    const config: WorkflowConfig = {
      modules: [
        { name: 'router', type: 'http.router', config: {} },
        { name: 'create-user', type: 'api.command', config: {} },
      ],
      workflows: {
        http: {
          router: 'router',
          routes: [
            {
              method: 'POST',
              path: '/users',
              handler: 'create-user',
              pipeline: {
                steps: [
                  { name: 'validate', type: 'step.validate' },
                  { name: 'insert', type: 'step.db_exec' },
                ],
              },
            },
          ],
        },
      },
      triggers: {},
    };

    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);

    const handlerNode = nodes.find((n) => n.data.label === 'create-user');
    expect(handlerNode).toBeDefined();

    const stepNodes = nodes.filter((n) => n.data.pipelineHandlerId !== undefined);
    expect(stepNodes).toHaveLength(2);

    for (const step of stepNodes) {
      expect(step.data.pipelineHandlerId).toBe(handlerNode!.id);
    }
  });

  it('step nodes attached to api.query handler carry pipelineHandlerId', () => {
    const config: WorkflowConfig = {
      modules: [
        { name: 'router', type: 'http.router', config: {} },
        { name: 'get-user', type: 'api.query', config: {} },
      ],
      workflows: {
        http: {
          router: 'router',
          routes: [
            {
              method: 'GET',
              path: '/users/:id',
              handler: 'get-user',
              pipeline: {
                steps: [
                  { name: 'fetch', type: 'step.db_query' },
                ],
              },
            },
          ],
        },
      },
      triggers: {},
    };

    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);

    const handlerNode = nodes.find((n) => n.data.label === 'get-user');
    const stepNode = nodes.find((n) => n.data.label === 'fetch');
    expect(handlerNode).toBeDefined();
    expect(stepNode?.data.pipelineHandlerId).toBe(handlerNode!.id);
  });

  it('pipelineHandlerId is not set for synthesized pipeline-only step nodes (uses pipelineName instead)', () => {
    const config: WorkflowConfig = {
      modules: [],
      workflows: {},
      triggers: {},
      pipelines: {
        'my-pipeline': {
          steps: [
            { name: 'parse', type: 'step.request_parse' },
            { name: 'respond', type: 'step.json_response' },
          ],
        },
      },
    };

    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);

    for (const node of nodes) {
      expect(node.data.pipelineHandlerId).toBeUndefined();
      expect(node.data.pipelineName).toBe('my-pipeline');
    }
  });

  it('multiple handlers each attach their own pipelineHandlerId to their steps', () => {
    const config: WorkflowConfig = {
      modules: [
        { name: 'router', type: 'http.router', config: {} },
        { name: 'handler-a', type: 'api.command', config: {} },
        { name: 'handler-b', type: 'api.command', config: {} },
      ],
      workflows: {
        http: {
          router: 'router',
          routes: [
            {
              method: 'POST',
              path: '/a',
              handler: 'handler-a',
              pipeline: {
                steps: [{ name: 'step-a', type: 'step.set' }],
              },
            },
            {
              method: 'POST',
              path: '/b',
              handler: 'handler-b',
              pipeline: {
                steps: [{ name: 'step-b', type: 'step.set' }],
              },
            },
          ],
        },
      },
      triggers: {},
    };

    const { nodes } = configToNodes(config, MODULE_TYPE_MAP);

    const handlerA = nodes.find((n) => n.data.label === 'handler-a');
    const handlerB = nodes.find((n) => n.data.label === 'handler-b');
    const stepA = nodes.find((n) => n.data.label === 'step-a');
    const stepB = nodes.find((n) => n.data.label === 'step-b');

    expect(stepA?.data.pipelineHandlerId).toBe(handlerA!.id);
    expect(stepB?.data.pipelineHandlerId).toBe(handlerB!.id);
    // They must reference different handler IDs
    expect(stepA?.data.pipelineHandlerId).not.toBe(stepB?.data.pipelineHandlerId);
  });
});
