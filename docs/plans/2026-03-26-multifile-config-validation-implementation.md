# Multi-File Config Validation & YAML Side-Pane — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Comprehensive test validation of multi-file workflow configs across domain-split, layer-split, and nested-directory patterns. Enhanced YAML line mapping. Optional YAML side-pane with multi-file navigation. Visual file boundaries on canvas. IDE-compatible navigation hooks.

**Architecture:** Three new fixture sets validate each split strategy end-to-end through resolveImports → configToNodes → nodesToConfig → exportToFiles round-trip. Extended yamlLineMap covers modules, pipelines, steps, workflows, and triggers for cross-file line resolution. Optional YamlSidePane renders file tabs + syntax coloring + line highlighting. FileGroupNode renders dashed-border containers per source file.

**Tech Stack:** TypeScript, React, Vitest, Playwright, @xyflow/react, js-yaml

**Design Doc:** `docs/plans/2026-03-26-multifile-config-validation-design.md`

---

### Task 1: Domain-Split Test Fixtures

**Files:**
- Create: `test-fixtures/multifile-domain/app.yaml`
- Create: `test-fixtures/multifile-domain/domains/auth.yaml`
- Create: `test-fixtures/multifile-domain/domains/billing.yaml`
- Create: `test-fixtures/multifile-domain/domains/notifications.yaml`
- Create: `test-fixtures/multifile-domain/shared/infra.yaml`

**Step 1: Create root config**

`test-fixtures/multifile-domain/app.yaml`:
```yaml
application:
  name: my-platform
  version: 3.0.0

imports:
  - domains/auth.yaml
  - domains/billing.yaml
  - domains/notifications.yaml
  - shared/infra.yaml

workflows:
  http:
    server: http-server
    router: router
    routes:
      - method: POST
        path: /api/auth/login
        handler: login
      - method: POST
        path: /api/auth/register
        handler: register
      - method: POST
        path: /api/billing/charge
        handler: charge
      - method: POST
        path: /api/billing/refund
        handler: refund
      - method: POST
        path: /api/notify/email
        handler: send-email
```

**Step 2: Create domain files**

`test-fixtures/multifile-domain/domains/auth.yaml`:
```yaml
modules:
  - name: auth-db
    type: database.postgres
    config:
      host: localhost
      port: 5432
      database: auth
  - name: auth-cache
    type: nosql.redis
    config:
      host: localhost
      port: 6379

pipelines:
  login:
    steps:
      - name: parse
        type: step.request_parse
      - name: validate
        type: step.validate
      - name: authenticate
        type: step.auth_validate
      - name: respond
        type: step.json_response
  register:
    steps:
      - name: parse
        type: step.request_parse
      - name: validate
        type: step.validate
      - name: insert
        type: step.db_exec
      - name: respond
        type: step.json_response
```

**Step 3: Create all other domain and shared files following the same pattern**

**Step 4: Commit**

---

### Task 2: Layer-Split Test Fixtures

**Files:**
- Create: `test-fixtures/multifile-layers/app.yaml`
- Create: `test-fixtures/multifile-layers/layers/infrastructure.yaml`
- Create: `test-fixtures/multifile-layers/layers/middleware.yaml`
- Create: `test-fixtures/multifile-layers/layers/services.yaml`
- Create: `test-fixtures/multifile-layers/layers/api.yaml`

**Step 1: Create root config**

`test-fixtures/multifile-layers/app.yaml`:
```yaml
application:
  name: layered-app
  version: 1.0.0

imports:
  - layers/infrastructure.yaml
  - layers/middleware.yaml
  - layers/services.yaml
  - layers/api.yaml
```

**Step 2: Create layer files**

- `infrastructure.yaml` — modules: [primary-db, cache, message-queue, logger]
- `middleware.yaml` — pipelines: [auth-middleware, rate-limit, cors]
- `services.yaml` — pipelines: [user-service, order-service, product-service]
- `api.yaml` — modules: [http-server, router], workflows: {http: routes referencing service pipelines}

**Step 3: Commit**

---

### Task 3: Nested-Directory Test Fixtures

**Files:**
- Create: `test-fixtures/multifile-nested/app.yaml`
- Create: `test-fixtures/multifile-nested/platform/platform.yaml`
- Create: `test-fixtures/multifile-nested/platform/core/core.yaml`
- Create: `test-fixtures/multifile-nested/platform/core/database.yaml`
- Create: `test-fixtures/multifile-nested/platform/core/cache.yaml`
- Create: `test-fixtures/multifile-nested/platform/features/features.yaml`
- Create: `test-fixtures/multifile-nested/platform/features/auth.yaml`
- Create: `test-fixtures/multifile-nested/platform/features/payments.yaml`

**Step 1: Create root config with single top-level import**

`test-fixtures/multifile-nested/app.yaml`:
```yaml
application:
  name: nested-platform
  version: 2.0.0

imports:
  - platform/platform.yaml
```

**Step 2: Create platform aggregator**

`test-fixtures/multifile-nested/platform/platform.yaml`:
```yaml
imports:
  - core/core.yaml
  - features/features.yaml
```

**Step 3: Create core aggregator + leaf files**

- `core.yaml` — imports: [database.yaml, cache.yaml]
- `database.yaml` — modules: [primary-db, replica-db]
- `cache.yaml` — modules: [redis-cache]

**Step 4: Create features aggregator + leaf files**

- `features.yaml` — imports: [auth.yaml, payments.yaml]
- `auth.yaml` — modules: [auth-service], pipelines: [login, register]
- `payments.yaml` — modules: [payment-gateway], pipelines: [charge, refund]

**Step 5: Commit**

---

### Task 4: Domain-Split Serialization Tests

**Files:**
- Create: `src/utils/serialization-multifile-domain.test.ts`

**Step 1: Write tests**

```typescript
describe('domain-split multi-file config', () => {
  // Load all fixtures from test-fixtures/multifile-domain/
  // Build resolver from file map

  it('resolves all modules across domain files and shared infra', async () => {
    // Expect: auth-db, auth-cache, billing-db, stripe, email-svc, sms-svc, http-server, router, logger
  });

  it('assigns correct sourceFile for every module', async () => {
    // auth-db → domains/auth.yaml, http-server → shared/infra.yaml, etc.
  });

  it('tracks all pipelines in sourceMap', async () => {
    // login → domains/auth.yaml, charge → domains/billing.yaml, etc.
  });

  it('round-trip export routes modules to correct domain files', async () => {
    // exportToFiles() puts each module back in its domain file
  });

  it('round-trip export routes pipelines to correct domain files', async () => {
    // exportToFiles() puts each pipeline back in its domain file
  });

  it('main file has imports: but no modules or pipelines', async () => {
    // Main file only has application:, imports:, workflows:
  });

  it('workflows stay in main file (routes reference cross-file pipelines)', async () => {
    // Workflows always belong to the main file
  });

  it('creates correct node count from merged config', async () => {
    // configToNodes() creates nodes for all modules + synthesized pipeline steps
  });

  it('edges connect cross-file nodes (routes to pipeline handlers)', async () => {
    // HTTP route edges connect to pipeline nodes from domain files
  });

  it('no module duplication after merge', async () => {
    // Set of module names has no duplicates
  });

  it('editing a domain module keeps it in its domain file', async () => {
    // Modify auth-db config, re-export, check it stays in domains/auth.yaml
  });

  it('application name and version preserved', async () => {
    // config.name === 'my-platform', config.version === '3.0.0'
  });
});
```

**Step 2: Run tests, fix any resolveImports bugs for this pattern**

**Step 3: Commit**

---

### Task 5: Layer-Split Serialization Tests

**Files:**
- Create: `src/utils/serialization-multifile-layers.test.ts`

**Step 1: Write tests**

```typescript
describe('layer-split multi-file config', () => {
  it('resolves modules from infrastructure and api layers', async () => {});
  it('resolves pipelines from middleware and services layers', async () => {});
  it('sourceMap assigns correct layer file for each module/pipeline', async () => {});
  it('round-trip export: modules stay in their layer file', async () => {});
  it('round-trip export: pipelines stay in their layer file', async () => {});
  it('round-trip export: workflows stay in api layer file', async () => {});
  it('main file only has application: and imports:', async () => {});
  it('no cross-layer bleed in exported files', async () => {});
});
```

**Step 2: Run tests, fix any bugs**

**Step 3: Commit**

---

### Task 6: Nested-Directory Serialization Tests

**Files:**
- Create: `src/utils/serialization-multifile-nested.test.ts`

**Step 1: Write tests**

```typescript
describe('nested-directory multi-file config', () => {
  it('resolves modules across 3+ levels of nesting', async () => {
    // primary-db from platform/core/database.yaml, auth-service from platform/features/auth.yaml
  });

  it('sourceMap uses full relative paths from root', async () => {
    // primary-db → platform/core/database.yaml (not just database.yaml)
  });

  it('handles intermediate aggregator files with no modules', async () => {
    // platform.yaml, core.yaml, features.yaml are pure import aggregators
  });

  it('round-trip export: leaf modules stay in leaf files', async () => {});

  it('round-trip export: aggregator files only have imports:', async () => {
    // platform.yaml export should only contain imports: [core/core.yaml, features/features.yaml]
  });

  it('relative paths in nested imports resolve correctly', async () => {
    // core.yaml imports database.yaml (relative to core/ directory)
    // This is resolved as platform/core/database.yaml from the root
  });

  it('missing leaf file in nested structure reports error but resolves siblings', async () => {
    // Remove payments.yaml from resolver, auth.yaml modules still appear
  });

  it('main file references only top-level import', async () => {
    // Main file has imports: [platform/platform.yaml] only
  });
});
```

**Step 2: Run tests — this is the most complex case, likely to surface path resolution bugs**

**Step 3: Fix `resolveImports()` if nested relative paths aren't handled correctly**

Currently `resolveImports()` may not resolve paths relative to the importing file's directory. If `core.yaml` (at `platform/core/core.yaml`) imports `database.yaml`, the resolver should receive `platform/core/database.yaml`, not `database.yaml`. Check and fix the path resolution logic.

**Step 4: Commit**

---

### Task 7: Enhanced YAML Line Map

**Files:**
- Modify: `src/utils/yamlLineMap.ts`
- Create: `src/utils/yamlLineMap.test.ts`

**Step 1: Extend `buildYamlLineMap` to cover all section types**

The current implementation only maps module names within the `modules:` block. Extend it to also map:
- `pipelines:` → pipeline names → `{ startLine, endLine }` for each pipeline
- Pipeline steps → `pipeline:step` keys → `{ startLine, endLine }` for each step
- `workflows:` → workflow names
- `triggers:` → trigger names

**Step 2: Add `buildMultiFileLineMap` function**

```typescript
export function buildMultiFileLineMap(
  files: Map<string | null, string>,
): MultiFileYamlLineMap {
  const result: MultiFileYamlLineMap = { files: new Map() };
  for (const [filePath, content] of files) {
    result.files.set(filePath, buildYamlLineMap(content));
  }
  return result;
}

export function lookupNodeInLineMap(
  lineMap: MultiFileYamlLineMap,
  nodeName: string,
  sourceFile?: string,
): { filePath: string | null; range: YamlLineRange } | null;
```

**Step 3: Write tests for all section types using the fixture files**

**Step 4: Commit**

---

### Task 8: Update onNavigateToSource Signature

**Files:**
- Modify: `src/types/editor.ts` — add filePath parameter
- Modify: `src/components/WorkflowEditor.tsx` — pass filePath from node data
- Modify: `src/components/canvas/WorkflowCanvas.tsx` — update onNodeClick handler
- Create: `src/utils/navigation.ts` — navigation helper functions
- Create: `src/utils/navigation.test.ts`

**Step 1: Update the type**

```typescript
// In editor.ts
onNavigateToSource?: (filePath: string | null, line: number, col: number) => void;
```

**Step 2: Create navigation helpers**

```typescript
// src/utils/navigation.ts
export function resolveNodeSourceLocation(
  node: WorkflowNode,
  lineMap: MultiFileYamlLineMap,
  sourceMap: Map<string, string>,
): { filePath: string | null; line: number; col: number } | null;
```

**Step 3: Wire into WorkflowCanvas node click handler**

When a node is clicked and `onNavigateToSource` is provided, call it with the resolved file path + line.

**Step 4: Write unit tests for navigation helpers**

**Step 5: Commit**

---

### Task 9: YAML Side-Pane Component

**Files:**
- Create: `src/components/yaml/YamlSidePane.tsx`
- Create: `src/components/yaml/YamlSidePane.test.tsx`
- Create: `src/components/yaml/FileTabBar.tsx`
- Create: `src/components/yaml/YamlLineRenderer.tsx`
- Modify: `src/types/editor.ts` — add `showYamlPane` prop
- Modify: `src/components/WorkflowEditor.tsx` — integrate YamlSidePane
- Modify: `src/stores/uiLayoutStore.ts` — add yamlPane collapse/width state

**Step 1: Create FileTabBar component**

Simple tab bar showing one tab per file. Active tab highlighted. Click to switch.

```tsx
interface FileTabBarProps {
  files: Array<{ path: string | null; label: string }>;
  activeFile: string | null;
  onSelect: (filePath: string | null) => void;
}
```

**Step 2: Create YamlLineRenderer component**

Renders YAML content with line numbers, syntax coloring (simple keyword highlighting for YAML keys, strings, comments), and line highlight range.

**Step 3: Create YamlSidePane component**

Combines FileTabBar + YamlLineRenderer. Handles scroll-to-line behavior.

**Step 4: Add `showYamlPane` prop to WorkflowEditorProps**

**Step 5: Integrate into WorkflowEditor layout**

When `showYamlPane` is true, add a fourth panel to the right of the property panel (or replace the property panel with a split view).

Layout:
```
┌─────────┬───────────────────┬────────────┬──────────────┐
│ Palette │     Canvas        │ Properties │  YAML Pane   │
│         │                   │            │  (optional)  │
└─────────┴───────────────────┴────────────┴──────────────┘
```

**Step 6: Wire node selection → YAML highlight**

When `selectedNodeId` changes in workflowStore, compute the line range and active file, update YamlSidePane props.

**Step 7: Wire YAML click → node selection**

When `onLineClick` fires, reverse-lookup the node from the line map, call `setSelectedNodeId()`.

**Step 8: Write component tests**

```typescript
describe('YamlSidePane', () => {
  it('renders file tabs for each file in the map');
  it('switches content when tab is clicked');
  it('highlights lines in the specified range');
  it('scrolls to highlighted lines');
  it('calls onLineClick when a line is clicked');
  it('does not render when visible=false');
});

describe('FileTabBar', () => {
  it('renders one tab per file');
  it('marks active tab with active class');
  it('calls onSelect with file path when tab is clicked');
  it('shows "main" for null file path');
});
```

**Step 9: Commit**

---

### Task 10: Visual File Boundary Groups

**Files:**
- Create: `src/components/nodes/FileGroupNode.tsx`
- Create: `src/components/nodes/FileGroupNode.test.tsx`
- Modify: `src/utils/serialization.ts` — add file group generation
- Modify: `src/stores/nodeTypeRegistry.ts` — register FileGroupNode
- Create: `src/utils/fileGroups.ts` — file group computation utilities
- Create: `src/utils/fileGroups.test.ts`

**Step 1: Create FileGroupNode component**

A React Flow group node with dashed border, subtle background color, and a file name label.

**Step 2: Create file group computation**

```typescript
// src/utils/fileGroups.ts
export function computeFileGroups(
  nodes: WorkflowNode[],
  sourceMap: Map<string, string>,
): FileGroupData[];

export interface FileGroupData {
  filePath: string;
  nodeIds: string[];
  bounds: { x: number; y: number; width: number; height: number };
  color: { bg: string; border: string };
}
```

**Step 3: Integrate into configToNodes or as a post-processing step**

After `configToNodes()` creates all nodes, call `computeFileGroups()` to generate group nodes. Insert them into the nodes array with `type: 'fileGroup'`.

**Step 4: Register FileGroupNode in node type registry**

**Step 5: Write tests**

```typescript
describe('computeFileGroups', () => {
  it('creates one group per unique sourceFile');
  it('does not create groups when only one source file');
  it('assigns distinct colors to each group');
  it('computes bounds from child node positions');
  it('handles nodes with no sourceFile (main file group)');
});
```

**Step 6: Commit**

---

### Task 11: E2E Visual Validation Tests

**Files:**
- Modify: `e2e/editor.spec.ts` — add multi-file visual tests

**Step 1: Create a test that loads a multi-file config and checks visual rendering**

```typescript
test('multi-file config shows file group boundaries', async ({ page }) => {
  // Load domain-split config
  // Check for file group nodes with dashed borders
  // Check for distinct background colors
  // Check for file name labels
});

test('clicking a node highlights YAML in side-pane', async ({ page }) => {
  // Enable showYamlPane
  // Load multi-file config
  // Click a node
  // Check YAML pane shows correct file tab and highlighted lines
});

test('clicking YAML line selects node on canvas', async ({ page }) => {
  // Enable showYamlPane
  // Load multi-file config
  // Click a line in the YAML pane
  // Check the corresponding node is selected on canvas
});
```

**Step 2: Commit**

---

### Task 12: IDE Plugin Bridge Updates (Design Only)

**NOTE:** This task describes changes needed in workflow-vscode and workflow-jetbrains repos. The implementation is tracked separately.

**workflow-vscode changes:**
- Update webview bridge to handle `navigateToSource` with `filePath` parameter
- When filePath is non-null, open the file in a text editor tab and go to the line
- Send `navigateToNode` messages when user clicks in YAML in the IDE text editor
- Listen for `fileChanged` messages to hot-reload when files are edited externally

**workflow-jetbrains changes:**
- Update JCEF bridge message handler for `navigateToSource` with `filePath`
- Use `FileEditorManager.openFile()` to navigate to the correct file + line
- Send `navigateToNode` messages from `CaretListener` when cursor moves in YAML
- File watcher already exists; extend to send `fileChanged` to webview

**Commit:** N/A (tracked in other repos)

---

## Summary of Deliverables

| Task | Type | Files |
|------|------|-------|
| 1-3 | Test fixtures | 17 new YAML files across 3 fixture sets |
| 4-6 | Serialization tests | 3 new test files (~30 test cases each) |
| 7 | YAML line map | Extended yamlLineMap.ts + new test file |
| 8 | Navigation hooks | Updated types + new navigation utils |
| 9 | YAML side-pane | 3 new components + component tests |
| 10 | File boundaries | New FileGroupNode + fileGroups utils |
| 11 | E2E tests | Extended Playwright tests |
| 12 | IDE bridge design | Documentation only (impl in other repos) |
