# Multi-File Config Validation & YAML Side-Pane — Design Document

**Date:** 2026-03-26
**Status:** Draft
**Repos:** workflow-editor, workflow-vscode, workflow-jetbrains

## Overview

Extend the workflow editor's multi-file config support with comprehensive test validation across config split permutations, an optional YAML side-pane with multi-file navigation, visual file boundaries on the canvas, and node-to-file navigation hooks. The goal is to ensure the visual editor can faithfully represent the entirety of an application configuration regardless of how the YAML files are organized, and to provide a common interface that IDE plugins can hook into for source-level navigation.

## 1. Problem Statement

### Current State

The editor already supports multi-file configs via `resolveImports()` and tracks source provenance in `sourceMap` (module/pipeline name → source file path). Nodes show a file badge on hover when multiple source files exist. `exportToFiles()` can split config back to per-file YAML.

### Gaps

1. **Limited test coverage of split permutations** — Only one multi-file fixture set exists (`test-fixtures/multifile/`), covering a single split strategy (application-level imports). Real projects split configs by domain, by architectural layer, and across nested directory trees. We have no test validation for these patterns.

2. **No YAML side-pane in the editor itself** — When the editor is used standalone (outside an IDE), there is no way to view the YAML alongside the canvas. When embedded in IDE plugins (workflow-vscode, workflow-jetbrains), the IDE's own text editor shows a single merged file, but there is no multi-file tab navigation or file-scoped view.

3. **No visual file boundaries on canvas** — When a config spans multiple files, there is no visual grouping on the canvas showing which nodes belong to which file. Users have to hover each node to see the file badge.

4. **Incomplete node-to-file navigation** — `onNavigateToSource` passes `(line, col)` but not the file path. For multi-file configs, clicking a node from `api.yaml` should navigate to the correct line *in that specific file*, not a line in the merged config.

5. **No reverse navigation** — When a user is viewing YAML and clicks on a section, the corresponding node should be selected and scrolled into view on the canvas.

## 2. Multi-File Config Split Strategies

Real applications split configs in at least three distinct patterns. We must test all of them.

### 2.1 Split by Domain

Each business domain owns its modules and pipelines in a separate file. A root config imports all domains.

```
project/
├── app.yaml                    ← root: application metadata + imports
├── domains/
│   ├── auth/
│   │   └── auth.yaml           ← modules: [auth-db, auth-cache], pipelines: [login, register, verify]
│   ├── billing/
│   │   └── billing.yaml        ← modules: [billing-db, stripe], pipelines: [charge, refund, invoice]
│   └── notifications/
│       └── notifications.yaml  ← modules: [email-svc, sms-svc], pipelines: [send-email, send-sms]
└── shared/
    └── infra.yaml              ← modules: [http-server, router, logger]
```

**Characteristics:**
- Each domain file has both `modules:` and `pipelines:`
- The root file has `imports:` + `application:` + `workflows:` (routes reference pipelines from domain files)
- Modules in domain files may reference shared infrastructure modules by name

### 2.2 Split by Architectural Layer

Config is split horizontally: infrastructure, middleware, business logic, API surface.

```
project/
├── app.yaml                    ← root: imports + workflows + application
├── layers/
│   ├── infrastructure.yaml     ← modules: [db, cache, message-queue, logger]
│   ├── middleware.yaml         ← pipelines: [auth-middleware, rate-limit, cors]
│   ├── services.yaml           ← pipelines: [user-service, order-service, product-service]
│   └── api.yaml                ← modules: [http-server, router], workflows: {http: ...}
```

**Characteristics:**
- Some files have only `modules:`, some only `pipelines:`, some have `workflows:`
- Cross-layer references (services reference infrastructure modules)
- The API layer defines routes that reference service-layer pipelines

### 2.3 Split by Nested Directories

Deep nesting with sub-imports. Each level imports its children.

```
project/
├── app.yaml                    ← imports: [platform/platform.yaml]
├── platform/
│   ├── platform.yaml           ← imports: [core/core.yaml, features/features.yaml]
│   ├── core/
│   │   ├── core.yaml           ← imports: [database.yaml, cache.yaml]
│   │   ├── database.yaml       ← modules: [primary-db, replica-db]
│   │   └── cache.yaml          ← modules: [redis-cache]
│   └── features/
│       ├── features.yaml       ← imports: [auth.yaml, payments.yaml]
│       ├── auth.yaml           ← modules + pipelines for auth
│       └── payments.yaml       ← modules + pipelines for payments
```

**Characteristics:**
- 3+ levels of nesting
- Intermediate files are pure import aggregators (no modules/pipelines of their own)
- Relative paths in imports are resolved relative to the importing file's directory

## 3. YAML Side-Pane (Optional, Embeddable)

### 3.1 Motivation

IDE plugins (workflow-vscode, workflow-jetbrains) already have their own text editors, so they don't need the editor to render YAML. But:

1. The **standalone editor** (browser, Storybook, demos) has no YAML view at all
2. We need a **common interface** for multi-file YAML navigation that IDE plugins can either use or replicate
3. Testing the node↔YAML navigation hooks requires an in-editor YAML view

### 3.2 Design

Add an optional YAML side-pane to the right side of the editor (collapsible, like PropertyPanel). The pane shows:

```
┌──────────────────────────────────────────────────────────┐
│  [app.yaml ▼] [auth.yaml] [billing.yaml] [infra.yaml]   │  ← file tabs
├──────────────────────────────────────────────────────────┤
│  1  application:                                         │
│  2    name: my-app                                       │
│  3    version: 1.0.0                                     │
│  4                                                       │
│  5  imports:                                              │
│  6    - domains/auth/auth.yaml                           │
│  7    - domains/billing/billing.yaml                     │
│  8    - shared/infra.yaml                                │
│  9                                                       │
│ 10  workflows:                                           │
│ 11    http:                                              │
│ 12      server: http-server                              │
│ 13      router: router                                   │
│ 14      routes:                                          │
│ 15  >>>   - method: POST                                 │  ← highlighted (selected node)
│ 16  >>>     path: /api/auth/login                        │
│ 17  >>>     handler: login                               │
│ 18        - method: POST                                 │
│ 19          path: /api/auth/register                     │
│ 20          handler: register                            │
└──────────────────────────────────────────────────────────┘
```

**File tabs:** One tab per file in the workspace. Active tab is highlighted. Clicking a tab switches the YAML view to that file's content.

**Line highlighting:** When a node is selected on the canvas, the YAML pane scrolls to and highlights the corresponding lines in the appropriate file (auto-switching tabs if the node belongs to a different file).

**Click-to-select:** Clicking on a YAML line in the pane selects the corresponding node on the canvas and scrolls it into view.

### 3.3 Component Architecture

```typescript
// New component: src/components/yaml/YamlSidePane.tsx
interface YamlSidePaneProps {
  /** Map of file path → YAML content. null key = main file. */
  files: Map<string | null, string>;
  /** Currently active file tab */
  activeFile: string | null;
  /** Called when user switches file tab */
  onFileSelect: (filePath: string | null) => void;
  /** Line range to highlight (1-based) */
  highlightRange?: { startLine: number; endLine: number };
  /** Called when user clicks a line */
  onLineClick?: (filePath: string | null, line: number) => void;
  /** Whether the pane is visible */
  visible: boolean;
}
```

### 3.4 IDE Plugin Integration

The YAML side-pane is **optional** — controlled by a new prop:

```typescript
interface WorkflowEditorProps {
  // ... existing props ...
  /** When true, shows the built-in YAML side-pane. Default: false.
   *  IDE plugins typically set this to false and use their own text editor. */
  showYamlPane?: boolean;
}
```

IDE plugins do NOT use the built-in YAML pane. Instead, they use the **navigation hooks**:

```typescript
interface WorkflowEditorProps {
  // ... existing props ...
  /** Enhanced navigation callback. When filePath is provided, navigate to
   *  the specified line in that file. Backward-compatible: hosts that only
   *  handle (line, col) can ignore the first argument.
   *  Overloaded: (line: number, col: number) => void  — legacy single-file
   *            | (filePath: string | null, line: number, col: number) => void  — multi-file */
  onNavigateToSource?: (...args: [number, number] | [string | null, number, number]) => void;
  /** NEW: Called when the editor wants the host to reveal a specific node.
   *  The host should select the node on canvas (the editor handles this internally,
   *  but the host may also want to update its own UI). */
  onNodeFocusRequest?: (nodeId: string) => void;
}
```

**Backward compatibility:** The `onNavigateToSource` callback uses a discriminated overload: callers detect the arity or first-argument type to distinguish `(line, col)` from `(filePath, line, col)`. This means existing IDE plugins (workflow-vscode, workflow-jetbrains) continue to work without changes. They can adopt the `filePath` parameter incrementally by checking `typeof args[0] === 'string'` in their bridge handlers.

## 4. Visual File Boundaries on Canvas

### 4.1 Concept

When a multi-file config is loaded, nodes from different source files should be visually grouped. This uses React Flow's built-in **group node** mechanism (which the editor already supports via `GroupNode.tsx`).

### 4.2 Implementation

For each unique source file in the workspace, create a background group node:

```typescript
interface FileGroupNode {
  id: `file-group:${string}`;
  type: 'fileGroup';
  data: {
    label: string;      // e.g., "auth.yaml"
    filePath: string;   // full relative path
    fileType: WorkflowFileType;
  };
  style: {
    backgroundColor: string;  // subtle tint per file (auto-assigned from palette)
    borderColor: string;
    borderStyle: 'dashed';
    borderRadius: 8;
  };
  // Position/size computed from child nodes' bounding box
}
```

**Behavior:**
- File group nodes are rendered as dashed-border containers behind their child nodes
- Each file gets a distinct subtle background color from a palette (8 colors, cycling)
- The file name is shown in the top-left corner of the group
- Clicking the group label triggers `onNavigateToSource(filePath, 1, 0)` — jump to line 1 of that file
- Group boundaries auto-resize when nodes are moved
- Groups are created only when `sourceMap` has entries from 2+ distinct files

### 4.3 File Group Color Palette

```typescript
const FILE_GROUP_COLORS = [
  { bg: '#EFF6FF', border: '#93C5FD' },  // blue
  { bg: '#F0FDF4', border: '#86EFAC' },  // green
  { bg: '#FFF7ED', border: '#FDBA74' },  // orange
  { bg: '#FAF5FF', border: '#C4B5FD' },  // purple
  { bg: '#FEF2F2', border: '#FCA5A5' },  // red
  { bg: '#ECFEFF', border: '#67E8F9' },  // cyan
  { bg: '#FFFBEB', border: '#FCD34D' },  // yellow
  { bg: '#FDF2F8', border: '#F9A8D4' },  // pink
];
```

## 5. Enhanced Node-to-File Navigation

### 5.1 YAML Line Map Enhancement

The existing `yamlLineMap.ts` only maps module names within a single `modules:` block. Extend it to also map:

- **Pipeline names** — line range where each pipeline is defined
- **Workflow names** — line range where each workflow section starts
- **Pipeline step names** — line range for individual steps within a pipeline
- **Trigger names** — line range for trigger definitions

```typescript
export interface YamlLineRange {
  startLine: number;
  endLine: number;
}

export interface MultiFileYamlLineMap {
  /** file path → { node/section name → line range } */
  files: Map<string | null, Record<string, YamlLineRange>>;
}

/**
 * Build a comprehensive line map across all files in the workspace.
 * Covers modules, pipelines, pipeline steps, workflows, and triggers.
 */
export function buildMultiFileLineMap(
  files: Map<string | null, string>,
): MultiFileYamlLineMap;
```

### 5.2 Navigation Flow

**Canvas → YAML (clicking a node):**

1. User clicks a node on the canvas
2. Editor looks up `node.data.sourceFile` to determine which file the node belongs to
3. Editor looks up `node.data.label` in the `MultiFileYamlLineMap` for that file
4. If YAML pane is active: switch to the file tab, scroll to and highlight the line range
5. If IDE embedded: call `onNavigateToSource(filePath, startLine, 0)`

**YAML → Canvas (clicking a YAML line):**

1. User clicks a line in the YAML pane (or IDE sends a navigate-to-node message)
2. Determine which node the line corresponds to (reverse lookup in `MultiFileYamlLineMap`)
3. Select the node on the canvas
4. Scroll/pan the canvas to center the node
5. Open the property panel for the node

### 5.3 IDE Bridge Protocol

For IDE plugins that use the webview bridge, add new message types:

```typescript
// Editor → Host (node clicked, navigate to source)
interface NavigateToSourceMessage {
  type: 'navigateToSource';
  filePath?: string | null;   // optional — omitted for single-file configs
  line: number;
  col: number;
  nodeName?: string;
}

// Host → Editor (user clicked in YAML, navigate to node)
interface NavigateToNodeMessage {
  type: 'navigateToNode';
  filePath: string | null;
  line: number;
}

// Host → Editor (file changed externally, reload)
interface FileChangedMessage {
  type: 'fileChanged';
  filePath: string | null;
  content: string;
}
```

## 6. Test Validation Strategy

### 6.1 Fixture-Based Serialization Tests

Create three new fixture sets covering each split strategy:

```
test-fixtures/
├── multifile/                      ← existing (simple application imports)
├── multifile-domain/               ← NEW: split by domain
│   ├── app.yaml
│   ├── domains/
│   │   ├── auth.yaml
│   │   ├── billing.yaml
│   │   └── notifications.yaml
│   └── shared/
│       └── infra.yaml
├── multifile-layers/               ← NEW: split by layer
│   ├── app.yaml
│   ├── layers/
│   │   ├── infrastructure.yaml
│   │   ├── middleware.yaml
│   │   ├── services.yaml
│   │   └── api.yaml
└── multifile-nested/               ← NEW: deep nesting
    ├── app.yaml
    └── platform/
        ├── platform.yaml
        ├── core/
        │   ├── core.yaml
        │   ├── database.yaml
        │   └── cache.yaml
        └── features/
            ├── features.yaml
            ├── auth.yaml
            └── payments.yaml
```

### 6.2 Test Matrix

For each fixture set, test:

| Test | What it validates |
|------|-------------------|
| **resolve-all-modules** | `resolveImports()` finds every module from every file |
| **sourceMap-correctness** | Every module and pipeline gets the correct source file path |
| **round-trip-export** | `exportToFiles()` puts each module/pipeline back in its source file |
| **main-file-imports** | Main file output contains `imports:` references, not inlined content |
| **no-cross-file-bleed** | Modules from file A don't appear in file B's export |
| **no-duplication** | No module or pipeline appears twice after merging |
| **node-creation** | `configToNodes()` creates correct node count with correct labels |
| **sourceFile-on-nodes** | Every node's `data.sourceFile` matches the sourceMap |
| **edge-creation** | Edges connect nodes across file boundaries (e.g., route → pipeline in different file) |
| **pipeline-steps** | Pipeline step nodes are created with correct `pipelineName` |
| **name-version-preserved** | Application name and version survive round-trip |
| **edit-stays-in-file** | Modifying a node and re-exporting keeps it in its original file |
| **cycle-detection** | Circular imports don't cause infinite loops |
| **missing-file-error** | Missing imported files produce errors but don't crash |
| **nested-path-resolution** | 3+ levels of imports resolve relative paths correctly |

### 6.3 YAML Line Map Tests

For each fixture, test the `buildMultiFileLineMap`:

| Test | What it validates |
|------|-------------------|
| **module-lines** | Each module name maps to correct line range in its source file |
| **pipeline-lines** | Each pipeline name maps to correct line range |
| **step-lines** | Each pipeline step maps to correct line range within its pipeline |
| **workflow-lines** | Each workflow section maps to correct line range |
| **cross-file-lookup** | Looking up a node returns the correct file + line |

### 6.4 Navigation Hook Tests

Unit tests for the navigation flow:

| Test | What it validates |
|------|-------------------|
| **node-click-calls-navigate** | Clicking a node with sourceFile calls `onNavigateToSource(filePath, line, col)` |
| **node-click-switches-tab** | When YAML pane is active, clicking a node from a different file switches the tab |
| **yaml-click-selects-node** | Clicking a YAML line selects the corresponding node on canvas |
| **yaml-click-cross-file** | Clicking a line in file B's tab selects a node from file B |
| **no-navigate-without-sourceMap** | Without sourceMap, `onNavigateToSource` passes null filePath |

### 6.5 Visual Validation Tests (E2E)

Playwright-based visual tests for the file boundaries and YAML pane:

| Test | What it validates |
|------|-------------------|
| **file-groups-rendered** | Multi-file config shows dashed group boundaries per file |
| **file-group-labels** | Each group has the correct file name label |
| **file-group-colors** | Groups have distinct background colors |
| **yaml-pane-toggle** | YAML pane shows/hides via toolbar button |
| **yaml-pane-file-tabs** | YAML pane shows tabs for each file |
| **yaml-pane-highlight** | Selecting a node highlights corresponding YAML lines |
| **yaml-pane-tab-switch** | Selecting a node from a different file switches tabs |
| **yaml-click-selects** | Clicking in YAML pane selects node on canvas |
| **file-group-click** | Clicking a file group label triggers navigation |

### 6.6 Component Tests (Vitest + React Testing Library)

| Test | What it validates |
|------|-------------------|
| **YamlSidePane-renders** | Component renders file tabs and YAML content |
| **YamlSidePane-tab-switch** | Clicking a tab calls `onFileSelect` |
| **YamlSidePane-highlight** | Line highlight renders at correct position |
| **YamlSidePane-line-click** | Clicking a line calls `onLineClick` |
| **YamlSidePane-hidden** | When `visible=false`, pane is not rendered |
| **FileGroupNode-renders** | File group node renders with correct label and style |
| **FileGroupNode-click** | Clicking group label triggers callback |

## 7. Additional Editor Functionality

Beyond the core multi-file and YAML pane features, the following related capabilities should be included in the implementation plan:

### 7.1 File-Scoped Validation Errors

When schema validation errors occur, they should be attributed to the correct source file:

```typescript
interface ValidationError {
  nodeId?: string;
  message: string;
  filePath?: string | null;  // NEW: which file the error originates from
  line?: number;             // NEW: line in the source file
}
```

The YAML pane should show inline error markers (red squiggle underline or gutter icon) at the error line. IDE plugins receive the `filePath` and `line` to show errors in their own editors.

### 7.2 File-Aware Undo/Redo

Currently undo/redo operates on the merged config. With multi-file awareness:
- Undo/redo should track which file was modified
- The change description should include the file name: "Modified auth.yaml: renamed module 'auth-db' to 'auth-database'"
- The YAML pane should update to show the file that was changed

### 7.3 Add-Node File Assignment

When a user adds a new node via the palette, the editor should:
1. If file groups are visible, and the node is dropped inside a file group → assign to that file
2. If dropped outside any group → assign to the main file
3. The PropertyPanel should show a "Source File" field that can be changed via dropdown

### 7.4 File-Level Export/Import

Add toolbar actions for file-level operations:
- **"Export File..."** — export a single file's YAML (useful for extracting a domain)
- **"Import File..."** — import YAML into the workspace as a new file (adds an `imports:` entry to the root)
- **"Move to File..."** — right-click a node → move it to a different file (updates sourceMap)

### 7.5 Workspace Summary Panel

A small info panel (tooltip or expandable section in the toolbar) showing:
- Total file count
- Module count per file
- Pipeline count per file
- Any unresolved imports or validation errors

## 8. Implementation Phases

### Phase 1: Test Fixtures & Serialization Validation
- Create 3 new multi-file fixture sets (domain, layers, nested)
- Write serialization tests for all 3 patterns
- Ensure `resolveImports()` handles nested-directory relative paths
- Fix any bugs discovered by the new test permutations

### Phase 2: Enhanced YAML Line Map & Navigation Hooks
- Extend `yamlLineMap.ts` to map pipelines, steps, workflows, triggers
- Build `MultiFileYamlLineMap` for cross-file line resolution
- Update `onNavigateToSource` signature to include `filePath`
- Add `onNodeFocusRequest` callback
- Write unit tests for line map and navigation

### Phase 3: YAML Side-Pane Component
- Implement `YamlSidePane` component with file tabs, syntax coloring, line numbers
- Add `showYamlPane` prop to `WorkflowEditorProps`
- Integrate with `uiLayoutStore` for collapse/resize state
- Wire node selection → YAML highlight (canvas → pane)
- Wire YAML click → node selection (pane → canvas)
- Write component tests

### Phase 4: Visual File Boundaries
- Implement `FileGroupNode` component
- Auto-generate file group nodes from sourceMap
- Assign colors from palette
- Auto-size groups from child node bounding boxes
- Wire group label click → navigation
- Write component and visual tests

### Phase 5: IDE Plugin Bridge Updates
- Update webview bridge message protocol in both IDE plugins
- Add `navigateToSource` message with `filePath` field
- Add `navigateToNode` reverse navigation message
- Add `fileChanged` live reload message
- Test with both VSCode and JetBrains plugins

### Phase 6: Additional Features
- File-scoped validation errors
- Add-node file assignment (drop into file group)
- "Move to File..." context menu
- Workspace summary panel
- File-aware undo/redo descriptions
