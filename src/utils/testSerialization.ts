/**
 * Bidirectional serialization between the test canvas (ReactFlow nodes + edges)
 * and the _test.yaml format used by wfctl test.
 *
 * Follows the same pattern as src/utils/serialization.ts.
 */
import yaml from 'js-yaml';
import type { Node, Edge } from '@xyflow/react';

// ──────────────────────────────────────────────
// _test.yaml schema types
// ──────────────────────────────────────────────

interface TestYamlMocks {
  steps?: Record<string, unknown>;
}

interface TestYamlTrigger {
  type?: string;       // pipeline | http | eventbus | scheduler
  name?: string;       // pipeline name / schedule name
  method?: string;     // http
  path?: string;       // http
  body?: unknown;      // http
  headers?: Record<string, string>; // http
  topic?: string;      // eventbus
  data?: unknown;      // pipeline / eventbus input data
}

interface TestYamlAssertion {
  step?: string;
  executed?: boolean;
  output?: Record<string, unknown>;
  response?: {
    status?: number;
    contains?: string;
    body?: unknown;
  };
  state?: Record<string, unknown>;
}

interface TestYamlCase {
  description?: string;
  trigger?: TestYamlTrigger;
  mocks?: TestYamlMocks;
  state?: { seed?: Record<string, unknown> };
  assertions?: TestYamlAssertion[];
}

interface TestYamlFile {
  config?: string;
  mocks?: TestYamlMocks;
  tests?: Record<string, TestYamlCase>;
}

// ──────────────────────────────────────────────
// Canvas → YAML
// ──────────────────────────────────────────────

/**
 * Convert test canvas nodes + edges to a _test.yaml string.
 *
 * Layout strategy:
 * - Each TriggerTestNode becomes a test case.
 * - Edges connect: mock → trigger → pipelineRef → assert / state
 * - Global mocks come from MockTestNodes not connected to a specific trigger.
 * - StateTestNodes connected to a trigger become per-test state seeds.
 * - AssertTestNodes downstream of a trigger become assertions.
 * - A lone PipelineRefNode referenced by a trigger determines the pipeline name.
 */
export function serializeTestCanvas(nodes: Node[], edges: Edge[]): string {
  const file: TestYamlFile = { mocks: {}, tests: {} };

  // Build adjacency maps
  const outEdges = new Map<string, string[]>();
  const inEdges = new Map<string, string[]>();
  for (const e of edges) {
    if (!outEdges.has(e.source)) outEdges.set(e.source, []);
    outEdges.get(e.source)!.push(e.target);
    if (!inEdges.has(e.target)) inEdges.set(e.target, []);
    inEdges.get(e.target)!.push(e.source);
  }

  const nodeMap = new Map<string, Node>();
  for (const n of nodes) nodeMap.set(n.id, n);

  // Collect mocks that are connected to nothing (global) vs connected to triggers
  const connectedMockIds = new Set<string>();

  // Find all trigger nodes
  const triggerNodes = nodes.filter((n) => n.type === 'triggerTest');

  if (triggerNodes.length === 0) {
    // No triggers — collect global mocks and emit empty tests
    const globalMocks = collectMocks(nodes.filter((n) => n.type === 'mockTest'));
    if (Object.keys(globalMocks).length > 0) {
      file.mocks = { steps: globalMocks };
    }
    return yaml.dump(file, { indent: 2, lineWidth: 120 });
  }

  // Process each trigger as a test case
  for (const trigger of triggerNodes) {
    const d = trigger.data as Record<string, unknown>;
    const testName = slugify((d.label as string) ?? 'test');
    const testCase: TestYamlCase = {};

    // Build trigger
    const triggerYaml = buildTrigger(d, trigger.id, outEdges, nodeMap);
    testCase.trigger = triggerYaml;

    // Find mocks connected to this trigger (incoming from mock nodes)
    const incomingIds = inEdges.get(trigger.id) ?? [];
    const perTestMocks: Record<string, unknown> = {};
    for (const srcId of incomingIds) {
      const src = nodeMap.get(srcId);
      if (src?.type === 'mockTest') {
        connectedMockIds.add(srcId);
        const md = src.data as Record<string, unknown>;
        const stepType = (md.stepType as string) ?? '';
        if (stepType) perTestMocks[stepType] = md.returnValue ?? {};
      }
    }
    if (Object.keys(perTestMocks).length > 0) {
      testCase.mocks = { steps: perTestMocks };
    }

    // Find state nodes connected to trigger
    const stateSeeds: Record<string, unknown> = {};
    for (const srcId of incomingIds) {
      const src = nodeMap.get(srcId);
      if (src?.type === 'stateTest') {
        const sd = src.data as Record<string, unknown>;
        const store = (sd.store as string) ?? 'default';
        stateSeeds[store] = sd.seedData ?? {};
      }
    }
    if (Object.keys(stateSeeds).length > 0) {
      testCase.state = { seed: stateSeeds };
    }

    // Walk downstream from trigger to collect assertions
    const assertions = collectAssertions(trigger.id, outEdges, nodeMap, new Set());
    if (assertions.length > 0) {
      testCase.assertions = assertions;
    }

    file.tests![testName] = testCase;
  }

  // Global mocks: MockTestNodes not connected to any trigger
  const unconnectedMocks = nodes.filter((n) => n.type === 'mockTest' && !connectedMockIds.has(n.id));
  const globalMocks = collectMocks(unconnectedMocks);
  if (Object.keys(globalMocks).length > 0) {
    file.mocks = { steps: globalMocks };
  }

  // Remove empty mocks key
  if (!file.mocks || Object.keys(file.mocks).length === 0) {
    delete file.mocks;
  }

  return yaml.dump(file, { indent: 2, lineWidth: 120 });
}

// ──────────────────────────────────────────────
// Helpers for canvas → YAML
// ──────────────────────────────────────────────

function buildTrigger(
  d: Record<string, unknown>,
  _triggerId: string,
  outEdges: Map<string, string[]>,
  nodeMap: Map<string, Node>,
): TestYamlTrigger {
  const triggerType = (d.triggerType as string) ?? 'http';

  if (triggerType === 'http') {
    const t: TestYamlTrigger = {
      type: 'http',
      method: (d.method as string) ?? 'GET',
      path: (d.path as string) ?? '/',
    };
    if (d.body) t.body = d.body;
    if (d.headers && Object.keys(d.headers as object).length > 0) t.headers = d.headers as Record<string, string>;
    return t;
  }

  if (triggerType === 'pipeline') {
    const pipelineName = (d.pipelineName as string) ?? (d.name as string) ?? '';
    const t: TestYamlTrigger = { type: 'pipeline', name: pipelineName };
    if (d.data) t.data = d.data;
    return t;
  }

  if (triggerType === 'eventbus') {
    const t: TestYamlTrigger = { type: 'eventbus' };
    if (d.topic) t.topic = d.topic as string;
    if (d.eventData) t.data = d.eventData;
    return t;
  }

  if (triggerType === 'scheduler') {
    return { type: 'scheduler', name: (d.scheduleName as string) ?? '' };
  }

  // Derive pipeline name from connected PipelineRefNode if available
  const outs = outEdges.get(_triggerId) ?? [];
  for (const targetId of outs) {
    const target = nodeMap.get(targetId);
    if (target?.type === 'pipelineRef') {
      const pd = target.data as Record<string, unknown>;
      return { type: 'pipeline', name: (pd.pipelineName as string) ?? '' };
    }
  }

  return { type: triggerType };
}

function collectAssertions(
  fromId: string,
  outEdges: Map<string, string[]>,
  nodeMap: Map<string, Node>,
  visited: Set<string>,
): TestYamlAssertion[] {
  const assertions: TestYamlAssertion[] = [];
  const queue = [...(outEdges.get(fromId) ?? [])];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = nodeMap.get(id);
    if (!node) continue;

    if (node.type === 'assertTest') {
      const assertion = buildAssertion(node.data as Record<string, unknown>);
      if (assertion) assertions.push(assertion);
    } else if (node.type === 'pipelineRef') {
      // Continue downstream through pipeline refs
      queue.push(...(outEdges.get(id) ?? []));
    }
  }

  return assertions;
}

function buildAssertion(d: Record<string, unknown>): TestYamlAssertion | null {
  const assertType = (d.assertType as string) ?? 'response';

  if (assertType === 'step_output' || assertType === 'step') {
    const stepName = (d.stepName as string) ?? (d.target as string) ?? '';
    const a: TestYamlAssertion = { step: stepName };
    if (d.outputKey && d.expected !== undefined) {
      a.output = { [d.outputKey as string]: d.expected };
    } else if (d.expected !== undefined) {
      a.output = d.expected as Record<string, unknown>;
    }
    return a;
  }

  if (assertType === 'step_executed') {
    return {
      step: (d.stepName as string) ?? (d.target as string) ?? '',
      executed: (d.executed as boolean) ?? true,
    };
  }

  if (assertType === 'response_status' || assertType === 'response') {
    const status = (d.expectedStatus as number) ?? (d.expected as number) ?? 200;
    return { response: { status } };
  }

  if (assertType === 'response_body') {
    const resp: TestYamlAssertion['response'] = {};
    if (d.containsText) resp.contains = d.containsText as string;
    if (d.jsonPath) resp.body = d.jsonPath;
    return { response: resp };
  }

  if (assertType === 'state_field' || assertType === 'state') {
    const store = (d.stateStore as string) ?? '';
    const key = (d.stateKey as string) ?? '';
    const field = (d.stateField as string) ?? '';
    const expected = d.expected;
    if (store && key && field) {
      return { state: { [store]: { [key]: { [field]: expected } } } };
    }
    if (d.expected !== undefined) {
      return { state: d.expected as Record<string, unknown> };
    }
    return null;
  }

  return null;
}

function collectMocks(mockNodes: Node[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const n of mockNodes) {
    const d = n.data as Record<string, unknown>;
    const stepType = (d.stepType as string) ?? '';
    if (stepType) result[stepType] = d.returnValue ?? {};
  }
  return result;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'test';
}

// ──────────────────────────────────────────────
// YAML → Canvas
// ──────────────────────────────────────────────

/**
 * Parse a _test.yaml string and produce positioned test canvas nodes + edges.
 *
 * Layout: left-to-right per test case, stacked vertically across cases.
 */
export function deserializeTestYAML(yamlText: string): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  let file: TestYamlFile;
  try {
    file = yaml.load(yamlText) as TestYamlFile;
  } catch {
    return { nodes, edges };
  }
  if (!file || typeof file !== 'object') return { nodes, edges };

  let idCounter = 1;
  const makeId = (prefix: string) => `${prefix}-${idCounter++}`;

  let yOffset = 60;
  const X_GAP = 240;
  const Y_GAP = 200;

  // ── Global mocks → MockTestNodes (placed at top-left) ──
  const globalMockNodes: Node[] = [];
  if (file.mocks?.steps) {
    let xMock = 60;
    for (const [stepType, returnValue] of Object.entries(file.mocks.steps)) {
      const id = makeId('mock');
      globalMockNodes.push({
        id,
        type: 'mockTest',
        position: { x: xMock, y: yOffset },
        data: { label: stepType, stepType, returnValue },
      });
      xMock += 200;
    }
    if (globalMockNodes.length > 0) {
      nodes.push(...globalMockNodes);
      yOffset += Y_GAP;
    }
  }

  // ── Test cases ──
  const tests = file.tests ?? {};
  for (const [testName, testCase] of Object.entries(tests)) {
    let xCursor = 60;
    const rowNodes: Node[] = [];
    const rowEdges: Edge[] = [];

    // State seed node (leftmost)
    let stateId: string | null = null;
    if (testCase.state?.seed) {
      const seed = testCase.state.seed;
      const stores = Object.keys(seed);
      const store = stores[0] ?? 'default';
      stateId = makeId('state');
      rowNodes.push({
        id: stateId,
        type: 'stateTest',
        position: { x: xCursor, y: yOffset },
        data: { label: `State: ${store}`, store, seedData: seed[store] },
      });
      xCursor += X_GAP;
    }

    // Per-test mocks (before trigger)
    const perTestMockIds: string[] = [];
    if (testCase.mocks?.steps) {
      for (const [stepType, returnValue] of Object.entries(testCase.mocks.steps)) {
        const id = makeId('mock');
        perTestMockIds.push(id);
        rowNodes.push({
          id,
          type: 'mockTest',
          position: { x: xCursor, y: yOffset + perTestMockIds.length * 100 },
          data: { label: stepType, stepType, returnValue },
        });
      }
      if (perTestMockIds.length > 0) xCursor += X_GAP;
    }

    // Trigger node
    const triggerId = makeId('trigger');
    const t = testCase.trigger ?? {};
    const triggerData = buildTriggerNodeData(testName, t);
    rowNodes.push({
      id: triggerId,
      type: 'triggerTest',
      position: { x: xCursor, y: yOffset },
      data: triggerData,
    });

    // Connect state → trigger
    if (stateId) {
      rowEdges.push({ id: `e-${stateId}-${triggerId}`, source: stateId, target: triggerId });
    }
    // Connect per-test mocks → trigger
    for (const mockId of perTestMockIds) {
      rowEdges.push({ id: `e-${mockId}-${triggerId}`, source: mockId, target: triggerId });
    }

    xCursor += X_GAP;

    // PipelineRef node (if trigger references a pipeline)
    let pipelineRefId: string | null = null;
    const pipelineName = t.name ?? '';
    if (pipelineName) {
      pipelineRefId = makeId('pipelineRef');
      rowNodes.push({
        id: pipelineRefId,
        type: 'pipelineRef',
        position: { x: xCursor, y: yOffset },
        data: { label: pipelineName, pipelineName },
      });
      rowEdges.push({ id: `e-${triggerId}-${pipelineRefId}`, source: triggerId, target: pipelineRefId });
      xCursor += X_GAP;
    }

    // Assertion nodes
    const assertionSrc = pipelineRefId ?? triggerId;
    let assertYOffset = yOffset;
    for (const assertion of testCase.assertions ?? []) {
      const assertId = makeId('assert');
      const assertData = buildAssertNodeData(assertion);
      rowNodes.push({
        id: assertId,
        type: 'assertTest',
        position: { x: xCursor, y: assertYOffset },
        data: assertData,
      });
      rowEdges.push({ id: `e-${assertionSrc}-${assertId}`, source: assertionSrc, target: assertId });
      assertYOffset += 120;
    }

    nodes.push(...rowNodes);
    edges.push(...rowEdges);
    yOffset += Math.max(Y_GAP, (testCase.assertions?.length ?? 1) * 120 + 60);
  }

  return { nodes, edges };
}

// ──────────────────────────────────────────────
// Helpers for YAML → canvas
// ──────────────────────────────────────────────

function buildTriggerNodeData(testName: string, t: TestYamlTrigger): Record<string, unknown> {
  const triggerType = t.type ?? 'http';
  const base: Record<string, unknown> = {
    label: testName,
    triggerType,
  };

  if (triggerType === 'http' || (!t.type && t.method)) {
    base.triggerType = 'http';
    base.method = t.method ?? 'GET';
    base.path = t.path ?? '/';
    if (t.body) base.body = t.body;
    if (t.headers) base.headers = t.headers;
  } else if (triggerType === 'pipeline') {
    base.pipelineName = t.name ?? '';
    base.name = t.name ?? '';
    if (t.data) base.data = t.data;
  } else if (triggerType === 'eventbus') {
    if (t.topic) base.topic = t.topic;
    if (t.data) base.eventData = t.data;
  } else if (triggerType === 'scheduler') {
    base.scheduleName = t.name ?? '';
  }

  return base;
}

function buildAssertNodeData(assertion: TestYamlAssertion): Record<string, unknown> {
  if (assertion.step !== undefined && assertion.executed !== undefined) {
    return {
      label: `Assert: ${assertion.step} executed`,
      assertType: 'step_executed',
      stepName: assertion.step,
      target: assertion.step,
      executed: assertion.executed,
    };
  }

  if (assertion.step !== undefined && assertion.output !== undefined) {
    const keys = Object.keys(assertion.output);
    const outputKey = keys[0] ?? '';
    return {
      label: `Assert: ${assertion.step}.${outputKey}`,
      assertType: 'step_output',
      stepName: assertion.step,
      target: assertion.step,
      outputKey,
      expected: assertion.output[outputKey],
    };
  }

  if (assertion.step !== undefined) {
    return {
      label: `Assert: ${assertion.step}`,
      assertType: 'step_executed',
      stepName: assertion.step,
      target: assertion.step,
      executed: true,
    };
  }

  if (assertion.response !== undefined) {
    if (assertion.response.status !== undefined) {
      return {
        label: `Assert: status ${assertion.response.status}`,
        assertType: 'response_status',
        target: 'status',
        expectedStatus: assertion.response.status,
        expected: assertion.response.status,
      };
    }
    return {
      label: 'Assert: response body',
      assertType: 'response_body',
      containsText: assertion.response.contains ?? '',
      jsonPath: assertion.response.body,
    };
  }

  if (assertion.state !== undefined) {
    const stores = Object.keys(assertion.state);
    const store = stores[0] ?? '';
    return {
      label: `Assert: state.${store}`,
      assertType: 'state_field',
      stateStore: store,
      expected: assertion.state,
    };
  }

  return { label: 'Assert', assertType: 'response', target: 'status', expected: 200 };
}

// ──────────────────────────────────────────────
// Utility: parse YAML safely
// ──────────────────────────────────────────────

export function parseTestYamlSafe(yamlText: string): { file: TestYamlFile | null; error?: string } {
  try {
    const parsed = yaml.load(yamlText) as TestYamlFile;
    if (!parsed || typeof parsed !== 'object') {
      return { file: null, error: 'Invalid YAML structure' };
    }
    return { file: parsed };
  } catch (e) {
    return { file: null, error: String(e) };
  }
}
