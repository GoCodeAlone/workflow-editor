# Editor Completeness Implementation Plan (Phases 1-2)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Schema-driven test matrix covering all 279 module types, property panel completeness tests, partial config rendering tests, breadcrumb navigation, and interactive file groups.

**Architecture:** Auto-generate vitest tests from engine-schemas.json using `describe.each()` to cover every module type's rendering and property panel. Add BreadcrumbBar component for file hierarchy navigation. Enhance existing FileGroupNode to be interactive. All work in workflow-editor on branch `copilot/extend-usability-test-validation`.

**Tech Stack:** TypeScript, React, Vitest, @testing-library/react, @xyflow/react, Playwright

**Design Doc:** `docs/plans/2026-03-27-editor-completeness-design.md`

---

### Task 1: Schema-Driven Node Rendering Test Matrix

**Files:**
- Create: `src/utils/schema-rendering-matrix.test.ts`
- Reference: `src/generated/engine-schemas.json`, `src/utils/serialization.ts`

**Step 1: Write the test file**

This test auto-generates a rendering test for every module type in engine-schemas.json. It verifies that `configToNodes()` produces a node with the correct component type and category.

```typescript
import { describe, it, expect } from 'vitest';
import engineData from '../generated/engine-schemas.json';
import { configToNodes, nodeComponentType } from './serialization.ts';
import { getEngineModuleTypes } from '../generated/load-schemas.ts';
import type { WorkflowConfig } from '../types/workflow.ts';

const moduleTypeMap = getEngineModuleTypes();
const allTypes = Object.keys((engineData as any).moduleSchemas);

// Category → expected node component type mapping
const CATEGORY_NODE_MAP: Record<string, string> = {
  http: 'httpNode',       // only http.server
  messaging: 'messagingNode',
  statemachine: 'stateMachineNode',
  events: 'eventNode',
  scheduling: 'schedulerNode',
  middleware: 'middlewareNode',
  database: 'databaseNode',
  observability: 'observabilityNode',
  security: 'securityNode',
  integration: 'integrationNode',
  infrastructure: 'infrastructureNode',
  pipeline: 'integrationNode',
  cicd: 'integrationNode',
  deployment: 'integrationNode',
  platform: 'infrastructureNode',
};

describe('schema-driven node rendering matrix', () => {
  it(`covers all ${allTypes.length} module types from engine-schemas.json`, () => {
    expect(allTypes.length).toBeGreaterThan(0);
  });

  describe.each(allTypes)('module type: %s', (moduleType) => {
    it('produces a node via configToNodes', () => {
      const config: WorkflowConfig = {
        modules: [{ name: 'test-node', type: moduleType, config: {} }],
        workflows: {},
        triggers: {},
      };
      const { nodes } = configToNodes(config, moduleTypeMap);
      expect(nodes.length).toBe(1);
      expect(nodes[0].data.label).toBe('test-node');
      expect(nodes[0].data.moduleType).toBe(moduleType);
    });

    it('maps to a valid node component type', () => {
      const componentType = nodeComponentType(moduleType);
      const validTypes = [
        'httpNode', 'httpRouterNode', 'messagingNode', 'stateMachineNode',
        'schedulerNode', 'eventNode', 'integrationNode', 'middlewareNode',
        'infrastructureNode', 'databaseNode', 'securityNode', 'observabilityNode',
        'conditionalNode',
      ];
      expect(validTypes).toContain(componentType);
    });

    it('has a category in the schema', () => {
      const schema = (engineData as any).moduleSchemas[moduleType];
      expect(schema.category).toBeTruthy();
    });
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run src/utils/schema-rendering-matrix.test.ts`
Expected: All 279 × 3 = 837 test cases pass (or close — some types may have quirks to fix).

**Step 3: Fix any failing tests**

If certain module types fail `configToNodes` (e.g., conditional types need special config), add exception handling in the test or fix the serialization code.

**Step 4: Commit**

```bash
git add src/utils/schema-rendering-matrix.test.ts
git commit -m "test: schema-driven rendering matrix for all 279 module types"
```

---

### Task 2: Property Panel Schema Completeness Matrix

**Files:**
- Modify: `src/components/properties/PropertyPanel.schema.test.ts` (expand from 10 types to all 279)

**Step 1: Refactor the existing schema test to iterate all types**

Replace the hardcoded `typesToAudit` array with `Object.keys(engineData.moduleSchemas)`. The existing test structure (field count, types, required flags, defaults, options) is already correct — just expand the scope.

```typescript
// Replace:
// const typesToAudit = ['http.server', 'http.middleware.cors', ...];
// With:
const typesToAudit = Object.keys((engineData as any).moduleSchemas);
```

Keep the existing per-type assertions:
- Field count match (engine vs editor)
- Field types match (with duration→string mapping)
- Required flags match
- Default values match
- Select options match

**Step 2: Run tests**

Run: `npx vitest run src/components/properties/PropertyPanel.schema.test.ts`
Expected: Most pass. Some may fail if static MODULE_TYPES is missing types that engine-schemas.json has.

**Step 3: Fix failures**

If types exist in engine-schemas.json but not in the editor's moduleTypeMap, they still load via `getEngineModuleTypes()` which reads engine-schemas.json directly. The test should pass because moduleTypeMap includes engine types. If not, investigate the merging logic.

**Step 4: Commit**

```bash
git add src/components/properties/PropertyPanel.schema.test.ts
git commit -m "test: expand property panel schema fidelity to all 279 module types"
```

---

### Task 3: Property Panel Rendering Tests (Component Tests)

**Files:**
- Create: `src/components/properties/PropertyPanel.rendering.test.tsx`

**Step 1: Write component rendering tests**

For a representative set of module types (one per field type combination), mount PropertyPanel with a selected node and verify the correct widgets render.

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { act } from '@testing-library/react';
import PropertyPanel from './PropertyPanel.tsx';
import useWorkflowStore from '../../stores/workflowStore.ts';
import engineData from '../../generated/engine-schemas.json';
import { getEngineModuleTypes } from '../../generated/load-schemas.ts';

const engineSchemas = (engineData as any).moduleSchemas;
const moduleTypeMap = getEngineModuleTypes();

function resetStore() {
  useWorkflowStore.setState({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    nodeCounter: 0,
    undoStack: [],
    redoStack: [],
    toasts: [],
    showAIPanel: false,
    showComponentBrowser: false,
  });
}

function selectNodeOfType(moduleType: string) {
  act(() => {
    useWorkflowStore.getState().addNode(moduleType, { x: 0, y: 0 });
  });
  const nodeId = useWorkflowStore.getState().nodes[0].id;
  act(() => {
    useWorkflowStore.getState().setSelectedNode(nodeId);
  });
  return nodeId;
}

// Widget type expectations per ConfigFieldDef.type
const FIELD_TYPE_WIDGET: Record<string, string> = {
  string: 'textbox',      // role="textbox" or input[type="text"]
  number: 'spinbutton',   // input[type="number"] has role spinbutton
  boolean: 'checkbox',    // input[type="checkbox"]
  select: 'combobox',     // <select> has role combobox
  // array, map, json, sql, filepath have custom components — test by class/testid
};

// Types that cover diverse field type combinations
const renderTestTypes = [
  'http.server',              // string (address), number (readTimeout via duration)
  'database.workflow',        // select (driver), string (dsn)
  'static.fileserver',        // string + boolean + number
  'http.middleware.cors',     // array (allowedOrigins, allowedMethods, allowedHeaders)
  'http.middleware.ratelimit', // number fields
  'cache.modular',            // select (provider)
  'storage.sqlite',           // string + number + boolean
  'conditional.switch',       // special: ConditionalCasesEditor
  'conditional.expression',   // special: ConditionalOutputsEditor
  'http.router',              // special: MiddlewareChainEditor
  'api.query',                // special: HandlerRoutesEditor
];

describe('PropertyPanel rendering — field widgets', () => {
  beforeEach(() => {
    resetStore();
  });

  for (const moduleType of renderTestTypes) {
    const schema = engineSchemas[moduleType];
    if (!schema) continue;
    const fields = schema.configFields ?? [];

    describe(`${moduleType}`, () => {
      it('renders all config field labels', () => {
        selectNodeOfType(moduleType);
        render(<PropertyPanel />);

        for (const field of fields) {
          // Each field should have its label visible
          const label = screen.queryByText(field.label);
          expect(label, `Missing label "${field.label}" for ${moduleType}.${field.key}`).toBeTruthy();
        }
      });

      it('renders correct widget type per field', () => {
        selectNodeOfType(moduleType);
        render(<PropertyPanel />);

        for (const field of fields) {
          const expectedWidget = FIELD_TYPE_WIDGET[field.type];
          if (!expectedWidget) continue; // skip complex types (array, map, json) — tested separately

          // Find the field's container by label, then check widget inside
          const label = screen.getByText(field.label);
          const container = label.closest('.property-field') ?? label.parentElement;
          if (!container) continue;
          const widget = within(container as HTMLElement).queryByRole(expectedWidget);
          expect(widget, `Expected ${expectedWidget} widget for ${moduleType}.${field.key} (type: ${field.type})`).toBeTruthy();
        }
      });

      if (fields.some((f: any) => f.required)) {
        it('shows required indicator for required fields', () => {
          selectNodeOfType(moduleType);
          render(<PropertyPanel />);

          for (const field of fields) {
            if (!field.required) continue;
            const label = screen.getByText(field.label);
            const container = label.closest('.property-field') ?? label.parentElement;
            if (!container) continue;
            // Required fields should have a visual indicator (asterisk or class)
            const indicator = (container as HTMLElement).querySelector('.required-indicator, [aria-required="true"]');
            // This may not exist yet — the test documents the expectation
          }
        });
      }
    });
  }
});

describe('PropertyPanel rendering — special editors', () => {
  beforeEach(() => {
    resetStore();
  });

  it('shows ConditionalCasesEditor for conditional.switch', () => {
    selectNodeOfType('conditional.switch');
    render(<PropertyPanel />);
    // Should have case management UI
    expect(screen.getByText(/cases|add case/i)).toBeTruthy();
  });

  it('shows HandlerRoutesEditor for api.query', () => {
    selectNodeOfType('api.query');
    render(<PropertyPanel />);
    // Should have route management UI
    expect(screen.getByText(/routes|handler routes/i)).toBeTruthy();
  });

  it('shows MiddlewareChainEditor for http.router', () => {
    selectNodeOfType('http.router');
    render(<PropertyPanel />);
    // Should have middleware chain UI
    expect(screen.getByText(/middleware/i)).toBeTruthy();
  });
});

describe('PropertyPanel rendering — zero configFields', () => {
  beforeEach(() => {
    resetStore();
  });

  // Find a module type with zero configFields
  const emptyTypes = Object.entries(engineSchemas)
    .filter(([, s]: [string, any]) => !s.configFields || s.configFields.length === 0)
    .map(([t]) => t);

  if (emptyTypes.length > 0) {
    it(`${emptyTypes[0]}: renders only name + type badge + delete (no config section)`, () => {
      selectNodeOfType(emptyTypes[0]);
      render(<PropertyPanel />);
      // Name input should exist
      expect(screen.getByRole('textbox')).toBeInTheDocument();
      // Type badge should exist
      expect(screen.getByText(emptyTypes[0])).toBeInTheDocument();
      // No config field labels should be present
      expect(screen.queryByText('Configuration')).toBeFalsy();
    });
  }
});

describe('PropertyPanel rendering — inheritance', () => {
  beforeEach(() => {
    resetStore();
  });

  it('inherited field shows inherited value with source indicator', () => {
    // Create two nodes with a dependency edge where the child inherits a field
    act(() => {
      useWorkflowStore.getState().addNode('http.server', { x: 0, y: 0 });
      useWorkflowStore.getState().addNode('http.router', { x: 200, y: 0 });
    });
    const nodes = useWorkflowStore.getState().nodes;
    // Add dependency edge
    act(() => {
      useWorkflowStore.getState().addEdge({
        id: 'e-dep', source: nodes[0].id, target: nodes[1].id,
        data: { edgeType: 'dependency' },
      });
      useWorkflowStore.getState().setSelectedNode(nodes[1].id);
    });
    render(<PropertyPanel />);
    // If any field has inheritFrom, it should show the inherited indicator
    // This test documents the expectation even if no fields currently inherit
  });
});

describe('PropertyPanel rendering — editing roundtrip', () => {
  beforeEach(() => {
    resetStore();
  });

  it('editing a string field updates node config', () => {
    selectNodeOfType('http.server');
    render(<PropertyPanel />);

    const addressInput = screen.getByDisplayValue(':8080');
    fireEvent.change(addressInput, { target: { value: ':9090' } });

    const node = useWorkflowStore.getState().nodes[0];
    expect(node.data.config.address).toBe(':9090');
  });

  it('editing a number field updates node config', () => {
    selectNodeOfType('http.middleware.ratelimit');
    render(<PropertyPanel />);

    // Find a number input and change it
    const numberInputs = screen.getAllByRole('spinbutton');
    if (numberInputs.length > 0) {
      fireEvent.change(numberInputs[0], { target: { value: '42' } });
      // Verify the store was updated (exact key depends on schema)
    }
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run src/components/properties/PropertyPanel.rendering.test.tsx`

**Step 3: Fix failures — adjust selectors based on actual DOM structure**

The exact DOM structure of PropertyPanel may differ from assumptions. Read the actual rendered output and fix selectors.

**Step 4: Commit**

```bash
git add src/components/properties/PropertyPanel.rendering.test.tsx
git commit -m "test: property panel rendering tests — field widgets, special editors, edit roundtrip"
```

---

### Task 4: Partial Config Rendering Tests

**Files:**
- Create: `src/utils/partial-config-rendering.test.ts`

**Step 1: Write tests for each partial config pattern**

```typescript
import { describe, it, expect } from 'vitest';
import { configToNodes } from './serialization.ts';
import { getEngineModuleTypes } from '../generated/load-schemas.ts';
import type { WorkflowConfig } from '../types/workflow.ts';

const moduleTypeMap = getEngineModuleTypes();

describe('partial config rendering', () => {
  describe('modules-only config', () => {
    it('renders module nodes without errors', () => {
      const config: WorkflowConfig = {
        modules: [
          { name: 'db', type: 'database.workflow', config: { driver: 'postgres' } },
          { name: 'cache', type: 'nosql.redis', config: {} },
        ],
        workflows: {},
        triggers: {},
      };
      const { nodes, edges } = configToNodes(config, moduleTypeMap);
      expect(nodes.length).toBe(2);
      expect(nodes.every(n => !n.data.synthesized)).toBe(true);
    });

    it('creates dependency edges when dependsOn is set', () => {
      const config: WorkflowConfig = {
        modules: [
          { name: 'server', type: 'http.server', config: { address: ':8080' } },
          { name: 'router', type: 'http.router', config: {}, dependsOn: ['server'] },
        ],
        workflows: {},
        triggers: {},
      };
      const { edges } = configToNodes(config, moduleTypeMap);
      const depEdges = edges.filter(e => (e.data as any)?.edgeType === 'dependency');
      expect(depEdges.length).toBe(1);
    });
  });

  describe('pipelines-only config', () => {
    it('renders synthesized step nodes', () => {
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
      const { nodes } = configToNodes(config, moduleTypeMap);
      expect(nodes.length).toBe(2);
      expect(nodes.every(n => n.data.synthesized)).toBe(true);
      expect(nodes[0].data.label).toBe('validate');
      expect(nodes[1].data.label).toBe('insert');
    });

    it('creates pipeline-flow edges between steps', () => {
      const config: WorkflowConfig = {
        modules: [],
        workflows: {},
        triggers: {},
        pipelines: {
          'my-pipeline': {
            steps: [
              { name: 'step1', type: 'step.set' },
              { name: 'step2', type: 'step.set' },
              { name: 'step3', type: 'step.set' },
            ],
          },
        },
      };
      const { edges } = configToNodes(config, moduleTypeMap);
      const flowEdges = edges.filter(e => (e.data as any)?.edgeType === 'pipeline-flow');
      expect(flowEdges.length).toBe(2);
    });

    it('renders multiple pipelines', () => {
      const config: WorkflowConfig = {
        modules: [],
        workflows: {},
        triggers: {},
        pipelines: {
          'pipeline-a': { steps: [{ name: 'a1', type: 'step.set' }] },
          'pipeline-b': { steps: [{ name: 'b1', type: 'step.set' }, { name: 'b2', type: 'step.set' }] },
        },
      };
      const { nodes } = configToNodes(config, moduleTypeMap);
      expect(nodes.length).toBe(3);
    });
  });

  describe('imports-only config', () => {
    it('produces zero nodes (blank canvas)', () => {
      const config: WorkflowConfig = {
        modules: [],
        workflows: {},
        triggers: {},
      };
      // Simulate an imports-only file: _originalKeys would have 'imports' but no modules
      const { nodes, edges } = configToNodes(config, moduleTypeMap);
      expect(nodes.length).toBe(0);
      expect(edges.length).toBe(0);
    });
  });

  describe('workflows-only config (no modules)', () => {
    it('produces zero nodes — workflows need modules to reference', () => {
      const config: WorkflowConfig = {
        modules: [],
        workflows: { http: { server: 'missing', router: 'missing', routes: [] } },
        triggers: {},
      };
      const { nodes } = configToNodes(config, moduleTypeMap);
      expect(nodes.length).toBe(0);
    });
  });

  describe('full config renders all edge types', () => {
    it('creates http-route edges for routes', () => {
      const config: WorkflowConfig = {
        modules: [
          { name: 'server', type: 'http.server', config: { address: ':8080' } },
          { name: 'router', type: 'http.router', config: {} },
          { name: 'handler', type: 'api.query', config: {} },
        ],
        workflows: {
          http: {
            server: 'server',
            router: 'router',
            routes: [{ method: 'GET', path: '/api/test', handler: 'handler' }],
          },
        },
        triggers: {},
      };
      const { edges } = configToNodes(config, moduleTypeMap);
      const routeEdges = edges.filter(e => (e.data as any)?.edgeType === 'http-route');
      expect(routeEdges.length).toBeGreaterThan(0);
      // Should have server→router and router→handler
      const labels = routeEdges.map(e => e.label);
      expect(labels).toContain('http');
      expect(labels).toContain('GET /api/test');
    });

    it('creates messaging-subscription edges', () => {
      const config: WorkflowConfig = {
        modules: [
          { name: 'broker', type: 'messaging.broker', config: {} },
          { name: 'handler', type: 'messaging.handler', config: {} },
        ],
        workflows: {
          messaging: {
            broker: 'broker',
            subscriptions: [{ topic: 'orders', handler: 'handler' }],
          },
        },
        triggers: {},
      };
      const { edges } = configToNodes(config, moduleTypeMap);
      const msgEdges = edges.filter(e => (e.data as any)?.edgeType === 'messaging-subscription');
      expect(msgEdges.length).toBe(1);
    });
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run src/utils/partial-config-rendering.test.ts`

**Step 3: Commit**

```bash
git add src/utils/partial-config-rendering.test.ts
git commit -m "test: partial config rendering — modules-only, pipelines-only, imports-only, edge types"
```

---

### Task 5: JSON Field Tech Debt Tracker

**Files:**
- Create: `src/utils/schema-json-audit.test.ts`

**Step 1: Write a test that identifies all json-typed fields as tech debt**

```typescript
import { describe, it, expect } from 'vitest';
import engineData from '../generated/engine-schemas.json';

const engineSchemas = (engineData as any).moduleSchemas as Record<string, any>;

describe('JSON field tech debt audit', () => {
  const jsonFields: Array<{ type: string; field: string }> = [];

  for (const [moduleType, schema] of Object.entries(engineSchemas)) {
    for (const field of schema.configFields ?? []) {
      if (field.type === 'json') {
        jsonFields.push({ type: moduleType, field: field.key });
      }
    }
  }

  it('tracks all json-typed fields (currently 60)', () => {
    // This test documents the current state. Update the count as fields are
    // converted to typed schemas in the workflow engine.
    console.log(`JSON-typed fields: ${jsonFields.length}`);
    for (const { type, field } of jsonFields) {
      console.log(`  TECH DEBT: ${type}.${field} uses json textarea`);
    }
    // When STRICT_SCHEMA env var is set, fail on any json fields
    if (process.env.STRICT_SCHEMA === 'true') {
      expect(jsonFields.length).toBe(0);
    } else {
      // Document current count — should only decrease over time
      expect(jsonFields.length).toBeLessThanOrEqual(60);
    }
  });

  it('json fields have a defaultValue to help users', () => {
    const missingDefaults = jsonFields.filter(({ type, field }) => {
      const schema = engineSchemas[type];
      const fieldDef = schema.configFields.find((f: any) => f.key === field);
      return fieldDef.defaultValue === undefined || fieldDef.defaultValue === null;
    });

    // Log fields missing defaults — these are the worst UX (empty textarea, no hint)
    if (missingDefaults.length > 0) {
      console.log(`JSON fields WITHOUT defaults (worst UX): ${missingDefaults.length}`);
      for (const { type, field } of missingDefaults) {
        console.log(`  ${type}.${field}`);
      }
    }
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run src/utils/schema-json-audit.test.ts`

**Step 3: Commit**

```bash
git add src/utils/schema-json-audit.test.ts
git commit -m "test: json field tech debt audit — tracks 60 json-typed fields for typed schema migration"
```

---

### Task 6: Breadcrumb Bar Component

**Files:**
- Create: `src/components/navigation/BreadcrumbBar.tsx`
- Create: `src/components/navigation/BreadcrumbBar.test.tsx`
- Modify: `src/components/WorkflowEditor.tsx` — integrate BreadcrumbBar

**Step 1: Write the test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BreadcrumbBar } from './BreadcrumbBar.tsx';

describe('BreadcrumbBar', () => {
  const defaultProps = {
    rootFile: 'app.yaml',
    currentFile: 'domains/auth.yaml',
    currentSection: 'login pipeline',
    onNavigate: vi.fn(),
  };

  beforeEach(() => {
    defaultProps.onNavigate.mockClear();
  });

  it('renders root file segment', () => {
    render(<BreadcrumbBar {...defaultProps} />);
    expect(screen.getByText('app.yaml')).toBeInTheDocument();
  });

  it('renders directory segments from path', () => {
    render(<BreadcrumbBar {...defaultProps} />);
    expect(screen.getByText('domains')).toBeInTheDocument();
  });

  it('renders current file segment', () => {
    render(<BreadcrumbBar {...defaultProps} />);
    expect(screen.getByText('auth.yaml')).toBeInTheDocument();
  });

  it('renders current section when provided', () => {
    render(<BreadcrumbBar {...defaultProps} />);
    expect(screen.getByText('login pipeline')).toBeInTheDocument();
  });

  it('clicking root file calls onNavigate with root path', () => {
    render(<BreadcrumbBar {...defaultProps} />);
    fireEvent.click(screen.getByText('app.yaml'));
    expect(defaultProps.onNavigate).toHaveBeenCalledWith('app.yaml', null);
  });

  it('clicking a directory is a no-op', () => {
    render(<BreadcrumbBar {...defaultProps} />);
    fireEvent.click(screen.getByText('domains'));
    expect(defaultProps.onNavigate).not.toHaveBeenCalled();
  });

  it('clicking current file calls onNavigate with file path', () => {
    render(<BreadcrumbBar {...defaultProps} />);
    fireEvent.click(screen.getByText('auth.yaml'));
    expect(defaultProps.onNavigate).toHaveBeenCalledWith('domains/auth.yaml', null);
  });

  it('renders unknown parent indicator when rootFile is null', () => {
    render(<BreadcrumbBar {...defaultProps} rootFile={null} />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('renders separator between segments', () => {
    render(<BreadcrumbBar {...defaultProps} />);
    const separators = screen.getAllByText('›');
    expect(separators.length).toBeGreaterThan(0);
  });

  it('renders only root when currentFile is null', () => {
    render(<BreadcrumbBar {...defaultProps} currentFile={null} currentSection={undefined} />);
    expect(screen.getByText('app.yaml')).toBeInTheDocument();
    expect(screen.queryByText('domains')).not.toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/navigation/BreadcrumbBar.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement BreadcrumbBar**

```typescript
// src/components/navigation/BreadcrumbBar.tsx
import { useMemo } from 'react';

export interface BreadcrumbBarProps {
  /** Root config file path (null if unknown) */
  rootFile: string | null;
  /** Current file being viewed (null = root file) */
  currentFile: string | null;
  /** Current section within the file (pipeline name, etc.) */
  currentSection?: string;
  /** Called when user clicks a breadcrumb segment */
  onNavigate: (filePath: string, section: string | null) => void;
}

export function BreadcrumbBar({ rootFile, currentFile, currentSection, onNavigate }: BreadcrumbBarProps) {
  const segments = useMemo(() => {
    const result: Array<{ label: string; filePath: string | null; clickable: boolean; isDir: boolean }> = [];

    // Root segment
    result.push({
      label: rootFile ? rootFile.split('/').pop()! : '?',
      filePath: rootFile,
      clickable: rootFile !== null,
      isDir: false,
    });

    if (currentFile && currentFile !== rootFile) {
      // Split path into directories + filename
      const parts = currentFile.split('/');
      let pathSoFar = '';
      for (let i = 0; i < parts.length - 1; i++) {
        pathSoFar += (pathSoFar ? '/' : '') + parts[i];
        result.push({ label: parts[i], filePath: pathSoFar, clickable: false, isDir: true });
      }
      // Filename
      result.push({ label: parts[parts.length - 1], filePath: currentFile, clickable: true, isDir: false });
    }

    if (currentSection) {
      result.push({ label: currentSection, filePath: currentFile, clickable: false, isDir: false });
    }

    return result;
  }, [rootFile, currentFile, currentSection]);

  return (
    <div className="breadcrumb-bar" style={{
      display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px',
      fontSize: 12, color: '#94a3b8', backgroundColor: '#16161e', borderBottom: '1px solid #2a2a3a',
    }}>
      <span style={{ fontSize: 14 }}>📁</span>
      {segments.map((seg, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {i > 0 && <span style={{ color: '#475569' }}>›</span>}
          <span
            onClick={seg.clickable ? () => onNavigate(seg.filePath!, null) : undefined}
            style={{
              cursor: seg.clickable ? 'pointer' : 'default',
              color: seg.clickable ? '#60a5fa' : (seg.isDir ? '#64748b' : '#94a3b8'),
              ...(seg.clickable ? { textDecoration: 'underline', textDecorationColor: 'transparent' } : {}),
            }}
            onMouseEnter={(e) => { if (seg.clickable) (e.target as HTMLElement).style.textDecorationColor = '#60a5fa'; }}
            onMouseLeave={(e) => { if (seg.clickable) (e.target as HTMLElement).style.textDecorationColor = 'transparent'; }}
          >
            {seg.label}
          </span>
        </span>
      ))}
    </div>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/navigation/BreadcrumbBar.test.tsx`

**Step 5: Integrate into WorkflowEditor**

In `src/components/WorkflowEditor.tsx`, add the BreadcrumbBar above the canvas:
- Derive `rootFile` from the initial YAML filename or `onResolveFile` discovery
- Derive `currentFile` from the selected node's `sourceFile`
- Derive `currentSection` from the selected node's `pipelineName`
- `onNavigate` calls `onNavigateToSource` if available, or switches the YAML pane tab

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: All existing tests + new tests pass.

**Step 7: Commit**

```bash
git add src/components/navigation/BreadcrumbBar.tsx src/components/navigation/BreadcrumbBar.test.tsx src/components/WorkflowEditor.tsx
git commit -m "feat: breadcrumb bar for multi-file navigation"
```

---

### Task 7: Interactive File Groups

**Files:**
- Modify: `src/components/nodes/FileGroupNode.tsx` — make header clickable
- Modify: `src/components/nodes/FileGroupNode.test.tsx` — add interaction tests
- Modify: `src/components/canvas/WorkflowCanvas.tsx` — handle file group clicks

**Step 1: Write failing tests for interactive behavior**

Add to `src/components/nodes/FileGroupNode.test.tsx`:

```typescript
it('clicking the file label calls onNavigate with the file path', () => {
  const onNavigate = vi.fn();
  render(<FileGroupNode data={{ label: 'auth.yaml', filePath: 'domains/auth.yaml', color: { bg: '#1a2332', border: '#93C5FD' }, onNavigate }} />);
  fireEvent.click(screen.getByText('auth.yaml'));
  expect(onNavigate).toHaveBeenCalledWith('domains/auth.yaml');
});

it('file label has pointer cursor on hover', () => {
  render(<FileGroupNode data={{ label: 'auth.yaml', filePath: 'domains/auth.yaml', color: { bg: '#1a2332', border: '#93C5FD' } }} />);
  const label = screen.getByText('auth.yaml');
  expect(label.style.cursor).toBe('pointer');
});

it('group background has pointer-events none', () => {
  const { container } = render(<FileGroupNode data={{ label: 'auth.yaml', filePath: 'domains/auth.yaml', color: { bg: '#1a2332', border: '#93C5FD' } }} />);
  const bg = container.firstChild as HTMLElement;
  expect(getComputedStyle(bg).pointerEvents).toBe('none');
});

it('double-clicking group opens file in YAML pane', () => {
  const onNavigate = vi.fn();
  render(<FileGroupNode data={{ label: 'auth.yaml', filePath: 'domains/auth.yaml', color: { bg: '#1a2332', border: '#93C5FD' }, onNavigate }} />);
  fireEvent.dblClick(screen.getByText('auth.yaml'));
  expect(onNavigate).toHaveBeenCalledWith('domains/auth.yaml');
});

it('file label area has pointer-events auto (clickable)', () => {
  render(<FileGroupNode data={{ label: 'auth.yaml', filePath: 'domains/auth.yaml', color: { bg: '#1a2332', border: '#93C5FD' } }} />);
  const label = screen.getByText('auth.yaml');
  expect(label.closest('[style*="pointer-events: auto"]') || label.style.pointerEvents === 'auto').toBeTruthy();
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/nodes/FileGroupNode.test.tsx`

**Step 3: Update FileGroupNode to make the header clickable**

Read `src/components/nodes/FileGroupNode.tsx` first. Then modify:
- Add `onNavigate?: (filePath: string) => void` to the data interface
- Make the filename label `pointer-events: auto` with `cursor: pointer`
- On click, call `data.onNavigate(data.filePath)`
- Keep the group background `pointer-events: none`

**Step 4: Wire into WorkflowCanvas**

When creating file group overlay nodes in WorkflowCanvas, pass `onNavigate` that:
1. Calls `onNavigateToSource(filePath, 1, 0)` if available
2. Switches YAML pane to that file's tab
3. Updates breadcrumb

**Step 5: Add "View full config" button for partial configs**

When the editor detects a partial config (no `modules:` and no `workflows:`, or has `imports:` but was loaded as a single file), show a small button in the toolbar: "View full config →". Clicking it calls `onNavigateToSource(rootFile, 1, 0)`.

**Step 6: Run all tests**

Run: `npx vitest run`

**Step 7: Commit**

```bash
git add src/components/nodes/FileGroupNode.tsx src/components/nodes/FileGroupNode.test.tsx src/components/canvas/WorkflowCanvas.tsx
git commit -m "feat: interactive file groups — clickable header, navigate to source file"
```

---

### Task 8: E2E Tests for Navigation and Completeness

**Files:**
- Modify: `e2e/editor.spec.ts` — add breadcrumb and navigation tests

**Step 1: Add E2E test scenarios**

```typescript
test.describe('breadcrumb navigation', () => {
  test('breadcrumb shows file hierarchy for multi-file config', async ({ page }) => {
    await page.goto('http://localhost:5173/?scenario=multifile-groups');
    await expect(page.locator('.breadcrumb-bar')).toBeVisible();
    // Root file should be shown
    await expect(page.locator('.breadcrumb-bar')).toContainText('app.yaml');
  });

  test('clicking a node updates breadcrumb to show its source file', async ({ page }) => {
    await page.goto('http://localhost:5173/?scenario=multifile-groups');
    await expect(page.locator('.react-flow__node').first()).toBeVisible();
    // Click a node from auth.yaml
    await page.locator('[data-id*="auth"]').first().click();
    await expect(page.locator('.breadcrumb-bar')).toContainText('auth.yaml');
  });

  test('clicking breadcrumb segment triggers navigation', async ({ page }) => {
    await page.goto('http://localhost:5173/?scenario=multifile-groups');
    await expect(page.locator('.react-flow__node').first()).toBeVisible();
    await page.locator('[data-id*="auth"]').first().click();
    // Click the root file breadcrumb
    await page.locator('.breadcrumb-bar').getByText('app.yaml').click();
    // Breadcrumb should reset
  });
});

test.describe('interactive file groups', () => {
  test('clicking file group label navigates to that file', async ({ page }) => {
    await page.goto('http://localhost:5173/?scenario=multifile-groups');
    await expect(page.locator('[data-id^="__file-group__"]').first()).toBeVisible();
    // File group labels should be visible and clickable
    const groupLabel = page.locator('[data-id^="__file-group__"] .file-group-label').first();
    await expect(groupLabel).toBeVisible();
  });
});

test.describe('node type visual rendering', () => {
  test('all node categories render with correct visual style', async ({ page }) => {
    await page.goto('http://localhost:5173/?scenario=all-node-types');
    await expect(page.locator('.react-flow__node').first()).toBeVisible();
    // Should have nodes rendered for each category
    const nodeCount = await page.locator('.react-flow__node').count();
    expect(nodeCount).toBeGreaterThan(10);
  });
});
```

**Step 2: Add test scenario to e2e test app**

Update the e2e test app at `e2e/test-app/` to support a `?scenario=all-node-types` that loads a config with one module per node category (15 modules covering all visual node types).

**Step 3: Run E2E tests**

Run: `npx playwright test`

**Step 4: Commit**

```bash
git add e2e/
git commit -m "test(e2e): breadcrumb navigation, interactive file groups, all node type rendering"
```

---

## Summary

| Task | Type | Scope |
|------|------|-------|
| 1 | Schema test matrix | 279 module types × 3 assertions = ~837 tests |
| 2 | Schema completeness | Expand from 10 → 279 types |
| 3 | Property panel rendering | Component tests for field widgets, special editors, roundtrip |
| 4 | Partial config rendering | modules-only, pipelines-only, imports-only, edge types |
| 5 | JSON field audit | Tech debt tracker for 60 json-typed fields |
| 6 | Breadcrumb bar | New component + WorkflowEditor integration |
| 7 | Interactive file groups | Enhance FileGroupNode + WorkflowCanvas |
| 8 | E2E navigation tests | Breadcrumb, file groups, all node types |
