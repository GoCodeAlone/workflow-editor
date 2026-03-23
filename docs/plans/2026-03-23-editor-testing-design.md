# Workflow Editor + IDE Testing Integration — Design Document

**Date:** 2026-03-23
**Status:** Approved
**Repos:** workflow-editor, workflow-vscode, workflow-jetbrains

## Overview

Add test authoring, visualization, and execution support to the workflow visual editor and IDE plugins. Includes: canvas-based test builder, test result overlays, multi-file/partial config support, `_test.yaml` schema validation, `.feature` @pipeline navigation, and `wfctl test` integration.

## 1. Schema Sync to v0.3.60

Trigger `sync-schema.yml` dispatch to update all 3 repos:
- `engine-schemas.json` — adds infra.*, step.deploy_*, step.container_build, step.iac_*, ValidationError/error_status
- `workflow-config.schema.json` — full step/module type coverage
- Generate new `workflow-test.schema.json` for `_test.yaml` file validation

## 2. Multi-File Config Discovery

### The Problem

Current file detection requires BOTH `modules:` AND `workflows:` — fails for partial configs, import-only files, test files, and feature files.

### Tiered File Detection

```typescript
type WorkflowFileType = 'config' | 'partial' | 'test' | 'feature';

function detectWorkflowFileType(document: TextDocument): WorkflowFileType | null {
  const text = document.getText();
  const path = document.fileName;

  // Full config
  if (text.includes('modules:') && text.includes('workflows:')) return 'config';

  // Partial config (has workflow-specific keys but not all)
  if (text.includes('pipelines:') || text.includes('modules:') ||
      text.includes('workflows:') || text.includes('imports:')) return 'partial';

  // Test file
  if (path.match(/_test\.ya?ml$/) && text.includes('tests:')) return 'test';

  // Feature file
  if (path.endsWith('.feature')) return 'feature';

  return null;
}
```

### Config Root Discovery

Auto-discover with optional override:

**Auto-discover (default):**
1. From any YAML file, walk up directories looking for a root config:
   - Files named `app.yaml`, `workflow.yaml`, `config.yaml`
   - Or any YAML file containing both `modules:` AND `workflows:`
2. From the root, scan the root directory + subdirectories for all YAML parts
3. Follow `imports:` directives for explicit linking
4. Build a merged workspace model with source file tracking

**Override via `.workflow.json`:**
```json
{
  "configRoot": "config/app.yaml",
  "testDirs": ["tests/", "features/"],
  "configDirs": ["config/", "pipelines/"]
}
```

**Override via IDE settings:**
- VSCode: `workflow.configRoot` setting
- JetBrains: `configPaths` in plugin settings (already exists, extend it)

### Example Project Layout

```
project/
├── .workflow.json              ← optional override
├── app.yaml                    ← root config (modules: + imports:)
├── pipelines/
│   ├── auth.yaml               ← partial (pipelines: only)
│   ├── payments.yaml           ← partial
│   └── admin.yaml              ← partial
├── tests/
│   ├── auth_test.yaml          ← test file (config: ../app.yaml)
│   ├── payments_test.yaml      ← test file
│   └── fixtures/
│       └── users.json          ← fixture data
├── features/
│   ├── auth.feature            ← Gherkin
│   └── payments.feature        ← Gherkin
└── config/
    └── modules.yaml            ← partial (modules: only, imported by app.yaml)
```

### Editor Workspace Model

```typescript
interface WorkflowWorkspace {
  rootConfig: string;                          // path to root config file
  files: Map<string, WorkflowFileInfo>;        // path → file info
  mergedConfig: WorkflowConfig;                // fully resolved config
  sourceMap: Map<string, string>;              // node/pipeline name → source file path
  testFiles: string[];                         // _test.yaml paths
  featureFiles: string[];                      // .feature paths
}

interface WorkflowFileInfo {
  path: string;
  type: WorkflowFileType;
  pipelines?: string[];         // pipeline names defined in this file
  modules?: string[];           // module names defined in this file
  tests?: string[];             // test case names (for test files)
}
```

The editor builds this workspace model on load, watches for file changes, and incrementally updates. Source file badges on nodes show which file each pipeline/module came from.

## 3. Canvas-Based Test Builder

### Test Node Types

| Node | Color | Icon | Purpose |
|---|---|---|---|
| **TriggerNode** | Blue | ▶ | HTTP request, pipeline call, event fire, schedule |
| **MockNode** | Orange | 🔧 | Step mock with return value |
| **AssertNode** | Green/Red | ✓/✗ | Assertion (step output, response, state) |
| **StateNode** | Purple | 📦 | State seed (inline or fixture file) |
| **PipelineRefNode** | Gray | ◈ | Reference to pipeline from config |

### Canvas Layout

Pipeline test:
```
┌──────────┐   ┌──────────────┐
│ Mock:    │──→│ Trigger:     │
│ db_query │   │ POST /api/v1 │
│ rows:[]  │   │ /auth/reg    │
└──────────┘   │ body: {...}  │
               └──────┬───────┘
┌──────────┐          │
│ Mock:    │──→ ┌─────▼──────┐
│ db_exec  │   │ Pipeline:   │
│ affected:1│  │ auth-register│
└──────────┘   └─────┬───────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
 ┌──────────┐ ┌──────────┐ ┌──────────┐
 │ Assert:  │ │ Assert:  │ │ Assert:  │
 │ status   │ │ step     │ │ state    │
 │ = 201    │ │ insert   │ │ users:   │
 │    ✅    │ │ executed │ │ verified │
 └──────────┘ └──────────┘ │ = false  │
                            └──────────┘
```

Stateful sequence:
```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ State:   │────→│ Execute: │────→│ Assert:  │
│ Seed     │     │ attack   │     │ state    │
│ combat.  │     │ warrior→ │     │ goblin   │
│ json     │     │ goblin   │     │ hp = 12  │
└──────────┘     └──────────┘     └────┬─────┘
                                       │
                 ┌──────────┐     ┌────▼─────┐
                 │ Execute: │────→│ Assert:  │
                 │ attack   │     │ state    │
                 │ goblin→  │     │ warrior  │
                 │ warrior  │     │ hp = 27  │
                 └──────────┘     └──────────┘
```

### Interaction Model

- **Right-click pipeline node** (in config view) → "Create Test" → switches to test canvas, scaffolds TriggerNode + MockNodes + PipelineRefNode based on the pipeline's config
- **Right-click step node** → "Add Assertion" → adds AssertNode connected to the pipeline
- **Drag from test palette** → drop TriggerNode, MockNode, AssertNode, StateNode
- **Double-click node** → property panel opens with form editor (JSON editor for bodies/mocks, dropdowns for assertion types)
- **▶ Run button** → serializes canvas to `_test.yaml`, calls `wfctl test`, updates node badges with results
- **Connect nodes** → defines execution order (sequences) or association (mocks → pipeline)

### Serialization

Canvas ↔ `_test.yaml` bidirectional sync (same pattern as config canvas ↔ YAML):
- Canvas changes → updates `_test.yaml` in the text editor
- YAML edits → updates canvas nodes
- Format is the standard wftest YAML format (`config:`, `mocks:`, `tests:`, `sequence:`)

### Pipeline Autocomplete in Test Canvas

When placing a PipelineRefNode or TriggerNode, the editor offers autocomplete from the workspace's merged config:
- Pipeline names from all resolved config files
- HTTP routes from pipeline trigger configs
- Step names from the selected pipeline (for assertions)

## 4. Test Result Overlay

### On Config View (pipeline nodes)

When test results are available, overlay badges on pipeline step nodes:

```typescript
interface TestResult {
  status: 'pass' | 'fail' | 'skip' | 'pending';
  error?: string;
  duration?: number;
  assertions?: AssertionResult[];
}

interface WorkflowEditorProps {
  // ... existing props ...
  testResults?: Record<string, TestResult>;  // step_name → result
  onTestRun?: (pipelineName: string) => void;
}
```

Step nodes render: ✅ (pass), ❌ (fail, red border + error tooltip), ⏭ (skip), ⏳ (pending/running).

### On Test Canvas

Test nodes update in real-time during execution:
- AssertNodes turn green/red based on assertion pass/fail
- StateNodes show current vs expected values on failure
- TriggerNode shows response status code

## 5. IDE Integration

### workflow-vscode

**New commands:**
| Command | Action |
|---|---|
| `workflow.test` | Run `wfctl test` on current file/directory |
| `workflow.testFile` | Run tests for active `_test.yaml` |
| `workflow.testCoverage` | Run `wfctl test --coverage` |
| `workflow.openTestEditor` | Open test canvas for current config |

**File associations:**
- `*_test.yaml` → `workflow-test.schema.json` validation + completions
- `.feature` → delegate to Cucumber extension + @pipeline navigation

**Test UI:**
- Play ▶ button in editor title for `_test.yaml` files
- Output channel: "Workflow Tests"
- Gutter icons: ✅❌ next to each test case in `_test.yaml`
- CodeLens on `@pipeline:name` in `.feature` → jump to pipeline in config
- CodeLens on `When I POST "/path"` → jump to pipeline with matching route

**Workspace detection:**
- On activation, scan workspace for `.workflow.json` or auto-discover root config
- Build WorkflowWorkspace model
- Watch for file changes in config/test directories

### workflow-jetbrains

**New actions:**
| Action | Command |
|---|---|
| RunTestsAction | `wfctl test` |
| TestCoverageAction | `wfctl test --coverage` |
| OpenTestEditorAction | Open test canvas |

**Run configurations:**
- "Workflow Test" run configuration for `_test.yaml`
- Green gutter run icon on test files

**Live templates (new):**
| Prefix | Expansion |
|---|---|
| `wftest` | Scaffold `_test.yaml` file |
| `wfscenario` | Test case with trigger + assertions |
| `wfmock` | Mock block |
| `wfassert` | Assertion block |
| `wfstate` | State seed block |

**File detection:**
- Extend `WorkflowFileDetector` with tiered detection
- `*_test.yaml` → test schema provider
- `.feature` → delegate to built-in Gherkin, add @pipeline navigation

## 6. Implementation Phases

### Phase 1: Schema Sync + Multi-File Foundation
- Trigger sync-schema dispatch to v0.3.60
- Generate workflow-test.schema.json
- Implement tiered file detection in both IDE plugins
- Implement config root discovery (auto-discover + .workflow.json override)
- Build WorkflowWorkspace model in editor

### Phase 2: IDE Test Commands + File Support
- Add `wfctl test` commands to both IDEs
- `_test.yaml` schema validation + completions
- `.feature` @pipeline navigation (CodeLens / gutter)
- Run button + output panel
- Live templates (JetBrains)

### Phase 3: Test Result Overlay
- `testResults` prop on WorkflowEditorProps
- Badge rendering on config pipeline step nodes
- Wire IDE test output → editor overlay
- Real-time update during test execution

### Phase 4: Canvas-Based Test Builder
- 5 new test node types (Trigger, Mock, Assert, State, PipelineRef)
- Test canvas mode (EditorModeConfig)
- Test palette (drag sources)
- Node property panel with form editors
- Canvas ↔ `_test.yaml` bidirectional serialization
- Pipeline/step autocomplete from workspace model
- "Create Test" context menu on pipeline nodes
- ▶ Run button on test canvas

### Phase 5: Stateful Test Sequences
- Sequence support in test canvas (ordered node chains)
- State seed nodes with fixture file picker
- State assertion nodes with field-level checking
- Visual sequence timeline view
