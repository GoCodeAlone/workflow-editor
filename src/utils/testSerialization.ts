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

interface TestYamlSequenceStep {
  name?: string;
  pipeline?: string;
  trigger?: {
    body?: unknown;
    headers?: Record<string, string>;
  };
  assertions?: TestYamlAssertion[];
}

interface TestYamlCase {
  description?: string;
  trigger?: TestYamlTrigger;
  mocks?: TestYamlMocks;
  state?: {
    seed?: Record<string, unknown>;
    fixtures?: Array<{ file: string; target: string }>;
  };
  assertions?: TestYamlAssertion[];
  sequence?: TestYamlSequenceStep[];
}

interface TestYamlFile {
  config?: string;
  mocks?: TestYamlMocks;
  tests?: Record<string, TestYamlCase>;
}

// ──────────────────────────────────────────────
// Sequence detection types (exported for store use)
// ──────────────────────────────────────────────

export interface SequenceStep {
  triggerNodeId: string;
  triggerNode: Node;
  assertNodes: Node[];
  pipelineRefNode?: Node;
}

export interface SequenceChain {
  stateNodeId: string;
  stateNode: Node;
  /** Ordered execution steps in the chain */
  steps: SequenceStep[];
}

// ──────────────────────────────────────────────
// Sequence detection
// ──────────────────────────────────────────────

/**
 * Detect stateful sequence chains in the test canvas.
 *
 * A sequence is a stateTest node connected via sequence edges to an ordered
 * chain of triggerTest nodes. Each triggerTest may have regular (non-sequence)
 * outgoing edges to assertTest nodes that form that step's assertions.
 *
 * Chain shape:
 *   stateTest --seq--> triggerTest₁ --seq--> triggerTest₂ --seq--> …
 *   triggerTest₁ ------> assertTest₁ᵃ  (regular edges)
 *   triggerTest₁ ------> assertTest₁ᵇ
 */
export function detectSequenceChains(nodes: Node[], edges: Edge[]): SequenceChain[] {
  const seqEdges = edges.filter(
    (e) => (e.data as Record<string, unknown>)?.edgeType === 'sequence',
  );

  const seqEdgeSet = new Set(seqEdges.map((e) => `${e.source}::${e.target}`));

  // Sequence-only adjacency
  const seqOut = new Map<string, string[]>();
  for (const e of seqEdges) {
    if (!seqOut.has(e.source)) seqOut.set(e.source, []);
    seqOut.get(e.source)!.push(e.target);
  }

  // All-edge adjacency (for collecting assertions)
  const allOut = new Map<string, string[]>();
  for (const e of edges) {
    if (!allOut.has(e.source)) allOut.set(e.source, []);
    allOut.get(e.source)!.push(e.target);
  }

  const nodeMap = new Map<string, Node>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const chains: SequenceChain[] = [];

  for (const n of nodes) {
    if (n.type !== 'stateTest') continue;
    const firstIds = seqOut.get(n.id) ?? [];
    if (firstIds.length === 0) continue;

    const steps: SequenceStep[] = [];
    let currentId = firstIds[0];
    const visited = new Set<string>([n.id]);

    while (currentId) {
      if (visited.has(currentId)) break;
      visited.add(currentId);

      const current = nodeMap.get(currentId);
      if (!current || current.type !== 'triggerTest') break;

      // Collect assertions: non-sequence outgoing edges that lead to assertTest nodes.
      // Also follow pipelineRef nodes to collect their downstream assertions.
      const assertNodes: Node[] = [];
      let pipelineRefNode: Node | undefined;

      for (const outId of allOut.get(currentId) ?? []) {
        if (seqEdgeSet.has(`${currentId}::${outId}`)) continue; // skip sequence edges
        const outNode = nodeMap.get(outId);
        if (!outNode) continue;
        if (outNode.type === 'assertTest') {
          assertNodes.push(outNode);
        } else if (outNode.type === 'pipelineRef') {
          pipelineRefNode = outNode;
          // Also collect assertions downstream of the pipelineRef
          for (const pid of allOut.get(outId) ?? []) {
            const pNode = nodeMap.get(pid);
            if (pNode?.type === 'assertTest') assertNodes.push(pNode);
          }
        }
      }

      steps.push({
        triggerNodeId: currentId,
        triggerNode: current,
        assertNodes,
        pipelineRefNode,
      });

      // Follow sequence edge to the next triggerTest
      const nextSeq = seqOut.get(currentId) ?? [];
      currentId = nextSeq[0] ?? '';
    }

    if (steps.length > 0) {
      chains.push({ stateNodeId: n.id, stateNode: n, steps });
    }
  }

  return chains;
}

// ──────────────────────────────────────────────
// Canvas → YAML
// ──────────────────────────────────────────────

/**
 * Convert test canvas nodes + edges to a _test.yaml string.
 *
 * Layout strategy:
 * - Sequence chains (stateTest + chain of triggerTest) are emitted as sequence: blocks.
 * - Each remaining TriggerTestNode becomes a standalone test case.
 * - Edges connect: mock → trigger → pipelineRef → assert / state
 * - Global mocks come from MockTestNodes not connected to a specific trigger.
 * - StateTestNodes connected to a trigger (non-sequence) become per-test state seeds.
 * - AssertTestNodes downstream of a trigger become assertions.
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

  // ── Detect sequence chains first ──────────────────
  const chains = detectSequenceChains(nodes, edges);

  // Collect all node IDs consumed by sequences so we skip them below
  const sequencedNodeIds = new Set<string>();
  for (const chain of chains) {
    sequencedNodeIds.add(chain.stateNodeId);
    for (const step of chain.steps) {
      sequencedNodeIds.add(step.triggerNodeId);
      for (const a of step.assertNodes) sequencedNodeIds.add(a.id);
      if (step.pipelineRefNode) sequencedNodeIds.add(step.pipelineRefNode.id);
    }
  }

  // Serialize each sequence chain
  for (const chain of chains) {
    const [testName, testCase] = serializeChain(chain);
    file.tests![testName] = testCase;
  }

  // ── Standalone (non-sequence) triggers ────────────
  const connectedMockIds = new Set<string>();

  const triggerNodes = nodes.filter(
    (n) => n.type === 'triggerTest' && !sequencedNodeIds.has(n.id),
  );

  for (const trigger of triggerNodes) {
    const d = trigger.data as Record<string, unknown>;
    const testName = slugify((d.label as string) ?? 'test');
    const testCase: TestYamlCase = {};

    testCase.trigger = buildTrigger(d, trigger.id, outEdges, nodeMap);

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

    const stateSeeds: Record<string, unknown> = {};
    for (const srcId of incomingIds) {
      const src = nodeMap.get(srcId);
      if (src?.type === 'stateTest' && !sequencedNodeIds.has(srcId)) {
        const sd = src.data as Record<string, unknown>;
        const store = (sd.store as string) ?? 'default';
        stateSeeds[store] = sd.seedData ?? {};
      }
    }
    if (Object.keys(stateSeeds).length > 0) {
      testCase.state = { seed: stateSeeds };
    }

    const assertions = collectAssertions(trigger.id, outEdges, nodeMap, new Set());
    if (assertions.length > 0) testCase.assertions = assertions;

    file.tests![testName] = testCase;
  }

  // ── Global mocks ───────────────────────────────────
  const unconnectedMocks = nodes.filter(
    (n) => n.type === 'mockTest' && !connectedMockIds.has(n.id),
  );
  const globalMocks = collectMocks(unconnectedMocks);
  if (Object.keys(globalMocks).length > 0) {
    file.mocks = { steps: globalMocks };
  }

  if (!file.mocks || Object.keys(file.mocks).length === 0) {
    delete file.mocks;
  }

  if (!file.tests || Object.keys(file.tests).length === 0) {
    delete file.tests;
  }

  return yaml.dump(file, { indent: 2, lineWidth: 120 });
}

// ──────────────────────────────────────────────
// Sequence chain serialization helper
// ──────────────────────────────────────────────

function serializeChain(chain: SequenceChain): [string, TestYamlCase] {
  const sd = chain.stateNode.data as Record<string, unknown>;
  const testName = slugify((sd.label as string) ?? 'sequence');
  const testCase: TestYamlCase = {};

  // State block
  const store = (sd.store as string) ?? 'default';
  if (sd.fixture) {
    testCase.state = {
      fixtures: [{ file: sd.fixture as string, target: store }],
    };
  } else if (sd.seedData) {
    testCase.state = { seed: { [store]: sd.seedData } };
  }

  // Sequence steps
  const sequenceSteps: TestYamlSequenceStep[] = [];
  for (const step of chain.steps) {
    const td = step.triggerNode.data as Record<string, unknown>;
    const stepName = slugify((td.label as string) ?? 'step');

    // Pipeline name: prefer pipelineRef, fall back to triggerNode fields
    const pipelineName =
      ((step.pipelineRefNode?.data as Record<string, unknown>)?.pipelineName as string) ??
      (td.pipelineName as string) ??
      (td.name as string) ??
      '';

    const seqStep: TestYamlSequenceStep = { name: stepName };
    if (pipelineName) seqStep.pipeline = pipelineName;

    const triggerPayload: Record<string, unknown> = {};
    if (td.body) triggerPayload.body = td.body;
    if (td.headers && Object.keys(td.headers as object).length > 0) {
      triggerPayload.headers = td.headers as Record<string, string>;
    }
    if (Object.keys(triggerPayload).length > 0) seqStep.trigger = triggerPayload;

    const assertions = step.assertNodes
      .map((a) => buildAssertion(a.data as Record<string, unknown>))
      .filter((a): a is TestYamlAssertion => a !== null);
    if (assertions.length > 0) seqStep.assertions = assertions;

    sequenceSteps.push(seqStep);
  }

  if (sequenceSteps.length > 0) testCase.sequence = sequenceSteps;

  return [testName, testCase];
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
 * Sequence tests produce a StateTestNode → chain of TriggerTestNodes connected
 * by numbered sequence edges, with AssertTestNodes hanging off each trigger.
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
    // ── Sequence case ──────────────────────────────────
    if (testCase.sequence && testCase.sequence.length > 0) {
      const rowNodes: Node[] = [];
      const rowEdges: Edge[] = [];
      let xCursor = 60;

      // StateTestNode (sequence root)
      const stateId = makeId('state');
      const state = testCase.state ?? {};
      const fixture = state.fixtures?.[0];
      const store =
        fixture?.target ??
        (state.seed ? Object.keys(state.seed)[0] : undefined) ??
        'default';
      const seedData = state.seed?.[store];

      rowNodes.push({
        id: stateId,
        type: 'stateTest',
        position: { x: xCursor, y: yOffset },
        data: {
          label: testName,
          store,
          fixture: fixture?.file,
          seedData,
        },
      });
      xCursor += X_GAP;

      let prevNodeId = stateId;
      let stepNumber = 1;
      let maxAssertRows = 1;

      for (const step of testCase.sequence) {
        const triggerId = makeId('trigger');
        rowNodes.push({
          id: triggerId,
          type: 'triggerTest',
          position: { x: xCursor, y: yOffset },
          data: {
            label: step.name ?? `step-${stepNumber}`,
            triggerType: 'pipeline',
            pipelineName: step.pipeline ?? '',
            body: step.trigger?.body,
            headers: step.trigger?.headers,
          },
        });

        // Sequence edge: prev → this trigger (numbered)
        rowEdges.push({
          id: `e-seq-${prevNodeId}-${triggerId}`,
          source: prevNodeId,
          target: triggerId,
          type: 'sequence',
          data: { edgeType: 'sequence', stepNumber },
        });

        xCursor += X_GAP;

        // Assert nodes hanging off this trigger
        let assertYOffset = yOffset;
        for (const assertion of step.assertions ?? []) {
          const assertId = makeId('assert');
          rowNodes.push({
            id: assertId,
            type: 'assertTest',
            position: { x: xCursor, y: assertYOffset },
            data: buildAssertNodeData(assertion),
          });
          rowEdges.push({
            id: `e-${triggerId}-${assertId}`,
            source: triggerId,
            target: assertId,
          });
          assertYOffset += 120;
        }
        maxAssertRows = Math.max(maxAssertRows, step.assertions?.length ?? 1);

        prevNodeId = triggerId;
        stepNumber++;
        xCursor += X_GAP;
      }

      nodes.push(...rowNodes);
      edges.push(...rowEdges);
      yOffset += Math.max(Y_GAP, maxAssertRows * 120 + 60);
      continue; // sequence case fully handled
    }

    // ── Standalone (non-sequence) case ────────────────
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

    if (stateId) {
      rowEdges.push({ id: `e-${stateId}-${triggerId}`, source: stateId, target: triggerId });
    }
    for (const mockId of perTestMockIds) {
      rowEdges.push({ id: `e-${mockId}-${triggerId}`, source: mockId, target: triggerId });
    }

    xCursor += X_GAP;

    // PipelineRef node
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
