import { describe, it, expect, beforeEach } from 'vitest';
import { parseYaml, configToNodes, nodesToConfig, configToYaml, nodeComponentType } from '../utils/serialization';
import { getEngineModuleTypes, getEngineCoercionRules } from '../generated/load-schemas';
import { isTypeCompatible, isPipelineFlowConnection } from '../utils/connectionCompatibility';
import { exportLayout, importLayout } from '../utils/layout-sidecar';
import type { WorkflowNode } from '../stores/workflowStore';

const moduleTypeMap = getEngineModuleTypes();

// Helper to do a full round-trip
function roundTrip(yaml: string) {
  const parsed = parseYaml(yaml);
  const { nodes, edges } = configToNodes(parsed, moduleTypeMap);
  const config = nodesToConfig(nodes, edges, moduleTypeMap, parsed);
  return { parsed, nodes, edges, config, yaml: configToYaml(config) };
}

// ─── 1. Full workflow lifecycle ───────────────────────────────────────────────

describe('full workflow lifecycle', () => {
  const httpYaml = `
modules:
  - name: web-server
    type: http.server
    config:
      address: ":8080"
  - name: main-router
    type: http.router
    dependsOn:
      - web-server
  - name: health-handler
    type: api.handler
    config:
      path: /health
workflows:
  http:
    server: web-server
    router: main-router
    routes:
      - method: GET
        path: /health
        handler: health-handler
triggers: {}
`;

  it('parses a 3-module HTTP config into nodes', () => {
    const { nodes } = roundTrip(httpYaml);
    // 3 real modules (step nodes may be absent if no pipeline)
    const moduleNodes = nodes.filter((n) => !n.data.synthesized);
    expect(moduleNodes.length).toBeGreaterThanOrEqual(3);
  });

  it('assigns correct component types to nodes', () => {
    const { nodes } = roundTrip(httpYaml);
    const server = nodes.find((n) => n.data.label === 'web-server');
    const router = nodes.find((n) => n.data.label === 'main-router');
    const handler = nodes.find((n) => n.data.label === 'health-handler');
    expect(server?.type).toBe('httpNode');
    expect(router?.type).toBe('httpRouterNode');
    expect(handler?.type).toBe('httpRouterNode');
  });

  it('creates http-route edge between server and router', () => {
    const { edges } = roundTrip(httpYaml);
    const httpEdge = edges.find(
      (e) => (e.data as { edgeType?: string })?.edgeType === 'http-route',
    );
    expect(httpEdge).toBeDefined();
  });

  it('creates route edge from router to handler', () => {
    const { edges } = roundTrip(httpYaml);
    const routeEdge = edges.find(
      (e) =>
        (e.data as { edgeType?: string; label?: string })?.edgeType === 'http-route' &&
        (e.data as { label?: string })?.label?.includes('/health'),
    );
    expect(routeEdge).toBeDefined();
  });

  it('round-trips all module names', () => {
    const { config } = roundTrip(httpYaml);
    const names = config.modules.map((m) => m.name);
    expect(names).toContain('web-server');
    expect(names).toContain('main-router');
    expect(names).toContain('health-handler');
  });

  it('adding a node and exporting produces 4 modules', () => {
    const { nodes, edges, parsed } = roundTrip(httpYaml);
    // Simulate adding a middleware node
    const newNode: WorkflowNode = {
      id: 'new_middleware_1',
      type: 'middlewareNode',
      position: { x: 200, y: 200 },
      data: {
        moduleType: 'http.middleware.cors',
        label: 'cors-middleware',
        config: {},
      },
    };
    const updatedNodes = [...nodes.filter((n) => !n.data.synthesized), newNode];
    const config = nodesToConfig(updatedNodes, edges, moduleTypeMap, parsed);
    // 3 original + 1 new = 4
    expect(config.modules.length).toBe(4);
    expect(config.modules.map((m) => m.name)).toContain('cors-middleware');
  });
});

// ─── 2. Pipeline flow lifecycle ───────────────────────────────────────────────

describe('pipeline flow lifecycle', () => {
  const pipelineYaml = `
modules:
  - name: api-server
    type: http.server
    config:
      address: ":9090"
  - name: api-router
    type: http.router
    dependsOn:
      - api-server
  - name: get-user
    type: api.query
    config:
      path: /user
workflows:
  http:
    server: api-server
    router: api-router
    routes:
      - method: GET
        path: /user
        handler: get-user
        pipeline:
          steps:
            - name: fetch-db
              type: db_query
              config:
                query: "SELECT * FROM users WHERE id = $1"
            - name: format-response
              type: set
              config:
                values:
                  user: "{{ .steps.fetch-db.row }}"
triggers: {}
`;

  it('creates pipeline-flow edges for step nodes', () => {
    const { edges } = roundTrip(pipelineYaml);
    const pipelineEdges = edges.filter(
      (e) => (e.data as { edgeType?: string })?.edgeType === 'pipeline-flow',
    );
    expect(pipelineEdges.length).toBeGreaterThanOrEqual(1);
  });

  it('isPipelineFlowConnection returns true for step-to-step', () => {
    expect(isPipelineFlowConnection('step.set', 'step.db_query')).toBe(true);
    expect(isPipelineFlowConnection('step.db_query', 'step.set')).toBe(true);
  });

  it('isPipelineFlowConnection returns true for handler to step', () => {
    expect(isPipelineFlowConnection('api.query', 'step.set')).toBe(true);
    expect(isPipelineFlowConnection('api.command', 'step.db_query')).toBe(true);
  });

  it('isPipelineFlowConnection returns false for non-step pairs', () => {
    expect(isPipelineFlowConnection('http.server', 'http.router')).toBe(false);
    expect(isPipelineFlowConnection('http.router', 'api.handler')).toBe(false);
    expect(isPipelineFlowConnection('database.workflow', 'http.server')).toBe(false);
  });

  it('synthesizes step nodes in graph', () => {
    const { nodes } = roundTrip(pipelineYaml);
    const stepNodes = nodes.filter((n) => n.data.moduleType.startsWith('step.'));
    expect(stepNodes.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── 3. Layout sidecar lifecycle ──────────────────────────────────────────────

describe('layout sidecar lifecycle', () => {
  const makeNode = (id: string, label: string, x: number, y: number): WorkflowNode => ({
    id,
    type: 'httpNode',
    position: { x, y },
    data: { moduleType: 'http.server', label, config: {} },
  });

  it('exports layout with positions keyed by label', () => {
    const nodes = [
      makeNode('n1', 'server', 100, 200),
      makeNode('n2', 'router', 300, 400),
      makeNode('n3', 'handler', 500, 600),
    ];
    const layout = exportLayout(nodes);
    expect(layout.version).toBe(1);
    expect(Object.keys(layout.positions)).toHaveLength(3);
    expect(layout.positions['server']).toEqual({ x: 100, y: 200 });
    expect(layout.positions['router']).toEqual({ x: 300, y: 400 });
    expect(layout.positions['handler']).toEqual({ x: 500, y: 600 });
  });

  it('imports layout and restores positions', () => {
    const nodes = [makeNode('n1', 'server', 0, 0), makeNode('n2', 'router', 0, 0)];
    const layout = exportLayout([
      makeNode('orig1', 'server', 150, 250),
      makeNode('orig2', 'router', 350, 450),
    ]);
    const { applied } = importLayout(nodes, layout);
    expect(applied).toBe(true);
    expect(nodes[0].position).toEqual({ x: 150, y: 250 });
    expect(nodes[1].position).toEqual({ x: 350, y: 450 });
  });

  it('export → import round-trip preserves positions', () => {
    const original = [makeNode('a', 'alpha', 111, 222), makeNode('b', 'beta', 333, 444)];
    const layout = exportLayout(original);

    // New nodes at origin
    const fresh = [makeNode('c', 'alpha', 0, 0), makeNode('d', 'beta', 0, 0)];
    importLayout(fresh, layout);

    expect(fresh[0].position).toEqual({ x: 111, y: 222 });
    expect(fresh[1].position).toEqual({ x: 333, y: 444 });
  });

  it('returns applied=false when no labels match', () => {
    const nodes = [makeNode('n1', 'unknown', 0, 0)];
    const layout = exportLayout([makeNode('x', 'other', 10, 20)]);
    const { applied } = importLayout(nodes, layout);
    expect(applied).toBe(false);
    expect(nodes[0].position).toEqual({ x: 0, y: 0 });
  });
});

// ─── 4. Schema-driven node type mapping ──────────────────────────────────────

describe('schema-driven node type mapping', () => {
  it('http.server → httpNode', () => {
    expect(nodeComponentType('http.server')).toBe('httpNode');
  });

  it('database.workflow → databaseNode', () => {
    expect(nodeComponentType('database.workflow')).toBe('databaseNode');
  });

  it('auth.jwt → securityNode', () => {
    expect(nodeComponentType('auth.jwt')).toBe('securityNode');
  });

  it('observability.otel → observabilityNode', () => {
    expect(nodeComponentType('observability.otel')).toBe('observabilityNode');
  });

  it('step.set → integrationNode', () => {
    expect(nodeComponentType('step.set')).toBe('integrationNode');
  });

  it('step.db_query → integrationNode', () => {
    expect(nodeComponentType('step.db_query')).toBe('integrationNode');
  });

  it('messaging.broker → messagingNode', () => {
    expect(nodeComponentType('messaging.broker')).toBe('messagingNode');
  });

  it('messaging.kafka → messagingNode', () => {
    expect(nodeComponentType('messaging.kafka')).toBe('messagingNode');
  });

  it('unknown.type → infrastructureNode', () => {
    expect(nodeComponentType('unknown.type')).toBe('infrastructureNode');
  });
});

// ─── 5. Coercion + edge type integration ──────────────────────────────────────

describe('coercion and edge type integration', () => {
  it('loads coercion rules (non-empty)', () => {
    const rules = getEngineCoercionRules();
    expect(Object.keys(rules).length).toBeGreaterThan(5);
  });

  it('http.Request → PipelineContext is compatible', () => {
    expect(isTypeCompatible('http.Request', 'PipelineContext')).toBe(true);
  });

  it('PipelineContext → any is compatible', () => {
    expect(isTypeCompatible('PipelineContext', 'any')).toBe(true);
  });

  it('any → anything is compatible', () => {
    expect(isTypeCompatible('any', 'sql.DB')).toBe(true);
    expect(isTypeCompatible('any', 'http.Request')).toBe(true);
  });

  it('exact type match is always compatible', () => {
    expect(isTypeCompatible('http.Request', 'http.Request')).toBe(true);
    expect(isTypeCompatible('SQL', 'SQL')).toBe(true);
  });

  it('http.Request → sql.DB is not compatible', () => {
    // http.Request coerces to [any, PipelineContext], not sql.DB
    expect(isTypeCompatible('http.Request', 'sql.DB')).toBe(false);
  });

  it('incompatible unrelated types return false', () => {
    expect(isTypeCompatible('Scheduler', 'SQL')).toBe(false);
  });

  it('moduleTypeMap contains http.server', () => {
    expect(moduleTypeMap['http.server']).toBeDefined();
    expect(moduleTypeMap['http.server'].type).toBe('http.server');
  });

  it('moduleTypeMap contains all expected categories', () => {
    const categories = new Set(Object.values(moduleTypeMap).map((m) => m.category));
    expect(categories.has('http')).toBe(true);
    expect(categories.has('database')).toBe(true);
    expect(categories.has('middleware')).toBe(true);
  });
});

// ─── 6. Config pass-through integrity ────────────────────────────────────────

describe('config pass-through integrity', () => {
  const complexYaml = `
modules:
  - name: srv
    type: http.server
    config:
      address: ":8080"
  - name: rtr
    type: http.router
    dependsOn:
      - srv
workflows:
  http:
    server: srv
    router: rtr
    routes: []
triggers: {}
pipelines:
  my-pipeline:
    steps:
      - name: step-one
        type: set
        config:
          values:
            key: value
requires:
  database:
    version: ">=1.0.0"
imports:
  - name: shared
    source: ./shared.yaml
platform:
  region: us-east-1
  environment: production
infrastructure:
  replicas: 3
  memory: 512Mi
sidecars:
  - name: metrics
    image: prom/prometheus:latest
`;

  it('preserves pipelines section after round-trip', () => {
    const { config } = roundTrip(complexYaml);
    expect(config.pipelines).toBeDefined();
    expect((config.pipelines as Record<string, unknown>)['my-pipeline']).toBeDefined();
  });

  it('preserves requires section after round-trip', () => {
    const { config } = roundTrip(complexYaml);
    expect(config.requires).toBeDefined();
    expect((config.requires as Record<string, unknown>)['database']).toBeDefined();
  });

  it('preserves imports section after round-trip', () => {
    const { config } = roundTrip(complexYaml);
    expect(config.imports).toBeDefined();
    expect((config.imports as Array<unknown>).length).toBe(1);
  });

  it('preserves platform section after round-trip', () => {
    const { config } = roundTrip(complexYaml);
    expect(config.platform).toBeDefined();
    expect((config.platform as Record<string, unknown>)['region']).toBe('us-east-1');
  });

  it('preserves infrastructure section after round-trip', () => {
    const { config } = roundTrip(complexYaml);
    expect(config.infrastructure).toBeDefined();
    expect((config.infrastructure as Record<string, unknown>)['replicas']).toBe(3);
  });

  it('preserves sidecars section after round-trip', () => {
    const { config } = roundTrip(complexYaml);
    expect(config.sidecars).toBeDefined();
    expect((config.sidecars as Array<unknown>).length).toBe(1);
  });

  it('produces valid YAML string from complex config', () => {
    const { yaml } = roundTrip(complexYaml);
    expect(typeof yaml).toBe('string');
    expect(yaml).toContain('modules');
    expect(yaml).toContain('pipelines');
    expect(yaml).toContain('my-pipeline');
  });
});
