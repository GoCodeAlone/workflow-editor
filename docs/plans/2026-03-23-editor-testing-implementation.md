# Editor + IDE Testing Integration — Implementation Plan (Phases 1-2)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Sync all 3 editor/IDE repos to workflow v0.3.60 schemas, add multi-file config discovery, tiered file detection, `_test.yaml` schema support, `wfctl test` commands, and `.feature` @pipeline navigation.

**Architecture:** Schema sync via existing dispatch chain. Multi-file discovery walks up directories to find config root. Tiered file detection classifies configs, partials, tests, and features. IDE plugins add test commands + file associations. `.workflow.json` provides optional override.

**Tech Stack:** TypeScript (editor + vscode), Kotlin (jetbrains), JSON Schema, wfctl CLI

**Design Doc:** `docs/plans/2026-03-23-editor-testing-design.md`

---

### Task 1: Schema Sync to v0.3.60

**Repos:** workflow-editor, workflow-vscode, workflow-jetbrains

**Step 1: Trigger schema sync from workflow engine**

The workflow engine has a `sync-schema.yml` workflow that dispatches `editor-release` to vscode and jetbrains. Trigger it:

```bash
cd /Users/jon/workspace/workflow
gh api repos/GoCodeAlone/workflow-editor/dispatches -f event_type=workflow-release -f "client_payload[version]=0.3.60"
```

If the automated sync doesn't cover everything, manually update:

**Step 2: Update workflow-editor engine-schemas.json**

```bash
cd /Users/jon/workspace/workflow-editor
# Regenerate schemas from the engine
cd /Users/jon/workspace/workflow
go run ./cmd/wfctl schema --format json > /Users/jon/workspace/workflow-editor/src/generated/engine-schemas.json
```

**Step 3: Update workflow-vscode schema**

```bash
cd /Users/jon/workspace/workflow-vscode
# Copy updated schema from workflow engine
cp /Users/jon/workspace/workflow/schema/workflow-config.schema.json schemas/
```

**Step 4: Update workflow-jetbrains schema**

```bash
cd /Users/jon/workspace/workflow-jetbrains
cp /Users/jon/workspace/workflow/schema/workflow-config.schema.json src/main/resources/schemas/
```

**Step 5: Generate workflow-test.schema.json**

Create a JSON Schema for `_test.yaml` files from the wftest YAML types. This can be hand-written or generated from the Go types. Place in all 3 repos.

**Step 6: Commit and push all 3 repos**

---

### Task 2: Tiered File Detection (workflow-vscode)

**Files:**
- Modify: `/Users/jon/workspace/workflow-vscode/src/visual-editor.ts`
- Create: `/Users/jon/workspace/workflow-vscode/src/file-detection.ts`
- Modify: `/Users/jon/workspace/workflow-vscode/src/test/suite/visual-editor.test.ts`

**Step 1: Create file-detection.ts**

```typescript
export type WorkflowFileType = 'config' | 'partial' | 'test' | 'feature';

export function detectWorkflowFileType(document: vscode.TextDocument): WorkflowFileType | null {
  const text = document.getText();
  const path = document.fileName;

  // Full config (existing behavior)
  if (text.includes('modules:') && text.includes('workflows:')) return 'config';

  // Test file (check before partial — test files may contain pipelines:)
  if (path.match(/_test\.ya?ml$/) && (text.includes('tests:') || text.includes('config:'))) return 'test';

  // Partial config
  if (text.includes('pipelines:') || text.includes('modules:') ||
      text.includes('workflows:') || text.includes('imports:')) return 'partial';

  // Feature file
  if (path.endsWith('.feature')) return 'feature';

  return null;
}
```

**Step 2: Update isWorkflowFile to use tiered detection**

```typescript
export function isWorkflowFile(document: vscode.TextDocument): boolean {
  const configPaths = vscode.workspace.getConfiguration('workflow').get<string[]>('configPaths', []);
  if (isExplicitMatch(document, configPaths)) return true;
  const type = detectWorkflowFileType(document);
  return type === 'config' || type === 'partial';
}

export function isTestFile(document: vscode.TextDocument): boolean {
  return detectWorkflowFileType(document) === 'test';
}

export function isFeatureFile(document: vscode.TextDocument): boolean {
  return detectWorkflowFileType(document) === 'feature';
}
```

**Step 3: Add tests for tiered detection**

**Step 4: Commit**

---

### Task 3: Tiered File Detection (workflow-jetbrains)

**Files:**
- Modify: `/Users/jon/workspace/workflow-jetbrains/src/main/kotlin/com/gocodealone/workflow/WorkflowFileDetector.kt`

Mirror the vscode tiered detection in Kotlin. Add `isTestFile()` and `isFeatureFile()` methods.

**Commit**

---

### Task 4: Config Root Discovery

**Files:**
- Create: `/Users/jon/workspace/workflow-vscode/src/workspace-discovery.ts`
- Create: `/Users/jon/workspace/workflow-vscode/src/test/suite/workspace-discovery.test.ts`

**Step 1: Implement root discovery**

```typescript
interface WorkflowWorkspace {
  rootConfig: string;
  files: Map<string, WorkflowFileInfo>;
  testFiles: string[];
  featureFiles: string[];
}

interface WorkflowFileInfo {
  path: string;
  type: WorkflowFileType;
}

// Walk up from a file to find the config root
export async function discoverConfigRoot(fromPath: string): Promise<string | null> {
  // 1. Check for .workflow.json in parent directories
  // 2. Check IDE setting workflow.configRoot
  // 3. Walk up looking for app.yaml, workflow.yaml, config.yaml
  // 4. Walk up looking for any YAML with modules: + workflows:
}

// Scan a directory for all workflow-related files
export async function scanWorkspace(rootDir: string): Promise<WorkflowWorkspace> {
  // Find root config, scan for partials, tests, features
}
```

**Step 2: Support .workflow.json**

```json
{
  "configRoot": "config/app.yaml",
  "testDirs": ["tests/", "features/"],
  "configDirs": ["config/", "pipelines/"]
}
```

**Step 3: Add tests**

**Step 4: Commit**

---

### Task 5: _test.yaml Schema Validation (workflow-vscode)

**Files:**
- Modify: `/Users/jon/workspace/workflow-vscode/package.json` — add yaml.schemas for test files
- Create: `/Users/jon/workspace/workflow-vscode/schemas/workflow-test.schema.json`

**Step 1: Create test schema**

JSON Schema covering the `_test.yaml` format: `config`, `mocks` (steps, modules), `tests` (each with trigger, assertions, stop_after, mocks, sequence, state).

**Step 2: Register in package.json**

```json
"yaml.schemas": {
  "./schemas/workflow-config.schema.json": ["workflow.yaml", "app.yaml"],
  "./schemas/workflow-test.schema.json": ["*_test.yaml", "*_test.yml"]
}
```

**Step 3: Commit**

---

### Task 6: _test.yaml Schema Validation (workflow-jetbrains)

Mirror Task 5 for JetBrains — add `WorkflowTestSchemaProviderFactory` that provides the test schema for `*_test.yaml` files.

**Commit**

---

### Task 7: wfctl test Commands (workflow-vscode)

**Files:**
- Modify: `/Users/jon/workspace/workflow-vscode/src/extension.ts` — register new commands
- Modify: `/Users/jon/workspace/workflow-vscode/package.json` — add command contributions

**Step 1: Add commands to package.json**

```json
{
  "command": "workflow.test",
  "title": "Workflow: Run Tests"
},
{
  "command": "workflow.testFile",
  "title": "Workflow: Run Test File"
},
{
  "command": "workflow.testCoverage",
  "title": "Workflow: Test Coverage"
}
```

**Step 2: Implement command handlers**

```typescript
// workflow.test — run wfctl test on workspace
async function runTests() {
  const terminal = vscode.window.createTerminal('Workflow Tests');
  terminal.sendText('wfctl test .');
  terminal.show();
}

// workflow.testFile — run tests for active file
async function runTestFile() {
  const file = vscode.window.activeTextEditor?.document.fileName;
  if (!file) return;
  const terminal = vscode.window.createTerminal('Workflow Tests');
  terminal.sendText(`wfctl test "${file}"`);
  terminal.show();
}

// workflow.testCoverage — show coverage report
async function runTestCoverage() {
  const rootConfig = await discoverConfigRoot(/* ... */);
  const terminal = vscode.window.createTerminal('Workflow Tests');
  terminal.sendText(`wfctl test --coverage "${rootConfig}" features/`);
  terminal.show();
}
```

**Step 3: Add run button for test files**

In `package.json` menus, add a play button in the editor title bar when the active file is a `_test.yaml`:

```json
"menus": {
  "editor/title": [
    {
      "command": "workflow.testFile",
      "when": "resourceFilename =~ /_test\\.ya?ml$/",
      "group": "navigation"
    }
  ]
}
```

**Step 4: Commit**

---

### Task 8: wfctl test Actions (workflow-jetbrains)

**Files:**
- Create: `/Users/jon/workspace/workflow-jetbrains/src/main/kotlin/com/gocodealone/workflow/actions/RunTestsAction.kt`
- Create: `.../actions/TestCoverageAction.kt`
- Modify: `plugin.xml` — register actions

Mirror Task 7 for JetBrains using `WfctlAction` pattern.

**Commit**

---

### Task 9: .feature @pipeline Navigation (workflow-vscode)

**Files:**
- Create: `/Users/jon/workspace/workflow-vscode/src/pipeline-navigation.ts`

**Step 1: CodeLens provider for .feature files**

Detect `@pipeline:name` tags and `When I POST "/path"` patterns in `.feature` files. Provide CodeLens that navigates to the pipeline definition in `app.yaml`.

```typescript
class PipelineCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i).text;
      // @pipeline:name tag
      const tagMatch = line.match(/@pipeline:(\S+)/);
      if (tagMatch) {
        lenses.push(new vscode.CodeLens(
          new vscode.Range(i, 0, i, line.length),
          { title: `→ ${tagMatch[1]}`, command: 'workflow.goToPipeline', arguments: [tagMatch[1]] }
        ));
      }
    }
    return lenses;
  }
}
```

**Step 2: Register CodeLens for .feature files**

**Step 3: Implement goToPipeline command** — search workspace YAML files for the pipeline definition

**Step 4: Commit**

---

### Task 10: .feature @pipeline Navigation (workflow-jetbrains)

Mirror Task 9 for JetBrains using `LineMarkerProvider` for gutter icons on `@pipeline:` tags.

**Commit**

---

### Task 11: Test Result Overlay Props (workflow-editor)

**Files:**
- Modify: `/Users/jon/workspace/workflow-editor/src/types/editor.ts` — add TestResult types
- Modify: `/Users/jon/workspace/workflow-editor/src/WorkflowCanvas.tsx` — accept testResults prop
- Modify: step node components — render badges

**Step 1: Add types**

```typescript
export interface TestResult {
  status: 'pass' | 'fail' | 'skip' | 'pending';
  error?: string;
  duration?: number;
}

// Add to WorkflowEditorProps
testResults?: Record<string, TestResult>;
onTestRun?: (pipelineName: string) => void;
```

**Step 2: Update node rendering**

Each step node checks `testResults[stepName]` and renders a badge icon in the top-right corner. Failed nodes get a red border and error tooltip.

**Step 3: Add "Run Tests" toolbar button** (shown when onTestRun is provided)

**Step 4: Commit, bump version, push**

---

### Task 12: Wire Test Results in IDE Plugins

**Files:**
- Modify: both IDE plugins' webview bridge code

When `wfctl test --json` produces test results, parse them and pass as `testResults` prop to the editor webview. This lights up the pass/fail badges on pipeline step nodes.

**Commit both repos**
