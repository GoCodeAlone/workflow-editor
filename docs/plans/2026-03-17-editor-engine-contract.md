# Editor-Engine Contract Enforcement — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate editor-engine drift by making the engine the single source of truth for connection rules, validation, and module schemas — and prevent the editor from polluting YAML configs with visual metadata.

**Architecture:** Engine exports module schemas + type coercion rules via `wfctl editor-schemas`. Editor CI imports this as a generated JSON file and derives all connection logic from it. Sidecar `.workflow-editor.json` files store layout positions separately from config YAML. Round-trip contract tests in the editor validate serialized output against the engine's JSON schema.

**Tech Stack:** Go (engine), TypeScript/vitest (editor), ajv (JSON schema validation), GitHub Actions (CI contract enforcement)

---

### Task 1: Add TypeCoercionRegistry to Engine

**Files:**
- Create: `schema/coercion.go`
- Create: `schema/coercion_test.go`

**Step 1: Write the test**

```go
// schema/coercion_test.go
package schema

import "testing"

func TestCoercionRegistryHasHTTPRequest(t *testing.T) {
	reg := NewTypeCoercionRegistry()
	rules := reg.Rules()
	targets, ok := rules["http.Request"]
	if !ok {
		t.Fatal("expected http.Request in coercion rules")
	}
	found := false
	for _, t2 := range targets {
		if t2 == "any" {
			found = true
		}
	}
	if !found {
		t.Error("http.Request should coerce to 'any'")
	}
}

func TestCoercionRegistryNotEmpty(t *testing.T) {
	reg := NewTypeCoercionRegistry()
	if len(reg.Rules()) == 0 {
		t.Fatal("coercion registry should not be empty")
	}
}
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/jon/workspace/workflow && go test ./schema/ -run TestCoercionRegistry -v`
Expected: FAIL — `NewTypeCoercionRegistry` undefined

**Step 3: Write the implementation**

```go
// schema/coercion.go
package schema

// TypeCoercionRegistry defines which output types can connect to which input types
// beyond exact match. This is the single source of truth — the editor reads it
// via `wfctl editor-schemas`.
type TypeCoercionRegistry struct {
	rules map[string][]string
}

// NewTypeCoercionRegistry creates a registry with all built-in coercion rules.
func NewTypeCoercionRegistry() *TypeCoercionRegistry {
	r := &TypeCoercionRegistry{rules: map[string][]string{
		// Data types
		"http.Request":  {"any", "PipelineContext"},
		"http.Response": {"any", "JSON", "[]byte"},
		"JSON":          {"any", "[]byte", "string"},
		"[]byte":        {"any", "string"},
		"Event":         {"any", "[]byte", "JSON"},
		"CloudEvent":    {"any", "Event", "[]byte", "JSON"},
		"Transition":    {"any", "Event"},
		"State":         {"any"},
		"string":        {"any"},
		"boolean":       {"any"},
		"Token":         {"any", "string"},
		"Credentials":   {"any"},
		"Time":          {"any", "Event"},
		"SQL":           {"any", "string"},
		"Rows":          {"any", "JSON"},
		"HealthStatus":  {"any", "JSON"},
		"Metric[]":      {"any"},
		"LogEntry":      {"any", "JSON"},
		"LogEntry[]":    {"any"},
		"[]LogEntry":    {"any"},
		"Span[]":        {"any"},
		"Command":       {"any", "PipelineContext"},
		"RouteConfig":   {"any", "JSON"},
		"OpenAPISpec":   {"any", "JSON"},
		"SlackResponse": {"any", "JSON"},
		"SQLiteStorage": {"any", "sql.DB"},
		"func()":        {"any"},

		// Pipeline types
		"PipelineContext": {"any", "StepResult", "PipelineContext"},
		"StepResult":     {"any", "PipelineContext", "StepResult"},

		// Service/provider types
		"prometheus.Metrics": {"any"},
		"net.Listener":      {"any"},
		"Scheduler":         {"any"},
		"AuthService":       {"any"},
		"EventBus":          {"any"},
		"Cache":             {"any"},
		"http.Client":       {"any"},
		"sql.DB":            {"any"},
		"SchemaValidator":   {"any"},
		"StorageProvider":   {"any"},
		"SecretProvider":    {"any"},
		"PersistenceStore":  {"any"},
		"WorkflowRegistry": {"any"},
		"ExternalAPIClient": {"any"},
		"FileStore":         {"any", "StorageProvider"},
		"ObjectStore":       {"any", "StorageProvider"},
		"UserStore":         {"any"},
		"trace.Span":        {"any"},
		"trace.Tracer":      {"any"},
	}}
	return r
}

// Rules returns the full coercion rules map.
func (r *TypeCoercionRegistry) Rules() map[string][]string {
	out := make(map[string][]string, len(r.rules))
	for k, v := range r.rules {
		cp := make([]string, len(v))
		copy(cp, v)
		out[k] = cp
	}
	return out
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/jon/workspace/workflow && go test ./schema/ -run TestCoercionRegistry -v`
Expected: PASS

**Step 5: Commit**

```bash
cd /Users/jon/workspace/workflow
git add schema/coercion.go schema/coercion_test.go
git commit -m "feat(schema): add TypeCoercionRegistry as single source of truth for type compatibility"
```

---

### Task 2: Add `wfctl editor-schemas` Command

**Files:**
- Create: `cmd/wfctl/editor_schemas.go`
- Modify: `cmd/wfctl/main.go:55-83` (add to commands map)

**Step 1: Write the command**

```go
// cmd/wfctl/editor_schemas.go
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"github.com/GoCodeAlone/workflow/schema"
)

type editorSchemasOutput struct {
	ModuleSchemas map[string]*schema.ModuleSchema `json:"moduleSchemas"`
	CoercionRules map[string][]string             `json:"coercionRules"`
}

func runEditorSchemas(args []string) error {
	fs := flag.NewFlagSet("editor-schemas", flag.ExitOnError)
	output := fs.String("output", "", "Write schemas to file instead of stdout")
	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "Usage: wfctl editor-schemas [options]\n\nExport module schemas and type coercion rules for the visual editor.\n\nOptions:\n")
		fs.PrintDefaults()
	}
	if err := fs.Parse(args); err != nil {
		return err
	}

	moduleReg := schema.NewModuleSchemaRegistry()
	coercionReg := schema.NewTypeCoercionRegistry()

	data := editorSchemasOutput{
		ModuleSchemas: moduleReg.AllMap(),
		CoercionRules: coercionReg.Rules(),
	}

	w := os.Stdout
	if *output != "" {
		f, err := os.Create(*output)
		if err != nil {
			return fmt.Errorf("create output file: %w", err)
		}
		defer f.Close()
		w = f
	}

	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	if err := enc.Encode(data); err != nil {
		return fmt.Errorf("encode schemas: %w", err)
	}

	if *output != "" {
		fmt.Fprintf(os.Stderr, "Editor schemas written to %s\n", *output)
	}
	return nil
}
```

**Step 2: Register the command in main.go**

In `cmd/wfctl/main.go`, add `"editor-schemas": runEditorSchemas,` to the `commands` map (around line 82, after existing entries).

**Step 3: Build and test**

Run: `cd /Users/jon/workspace/workflow && go build -o wfctl ./cmd/wfctl && ./wfctl editor-schemas | head -30`
Expected: JSON output with `moduleSchemas` and `coercionRules` keys

**Step 4: Commit**

```bash
cd /Users/jon/workspace/workflow
git add cmd/wfctl/editor_schemas.go cmd/wfctl/main.go
git commit -m "feat(wfctl): add editor-schemas command for visual editor contract"
```

---

### Task 3: Add Golden File Contract Test in Engine

**Files:**
- Create: `schema/testdata/editor-schemas.golden.json`
- Create: `schema/editor_contract_test.go`

**Step 1: Generate the initial golden file**

Run: `cd /Users/jon/workspace/workflow && mkdir -p schema/testdata && ./wfctl editor-schemas --output schema/testdata/editor-schemas.golden.json`

**Step 2: Write the contract test**

```go
// schema/editor_contract_test.go
package schema

import (
	"encoding/json"
	"os"
	"testing"
)

type editorSchemasGolden struct {
	ModuleSchemas map[string]*ModuleSchema `json:"moduleSchemas"`
	CoercionRules map[string][]string      `json:"coercionRules"`
}

func TestEditorSchemasGoldenFile(t *testing.T) {
	// Generate current output
	moduleReg := NewModuleSchemaRegistry()
	coercionReg := NewTypeCoercionRegistry()

	current := editorSchemasGolden{
		ModuleSchemas: moduleReg.AllMap(),
		CoercionRules: coercionReg.Rules(),
	}

	currentJSON, err := json.MarshalIndent(current, "", "  ")
	if err != nil {
		t.Fatalf("marshal current: %v", err)
	}

	goldenPath := "testdata/editor-schemas.golden.json"

	if os.Getenv("UPDATE_GOLDEN") == "1" {
		if err := os.WriteFile(goldenPath, append(currentJSON, '\n'), 0644); err != nil {
			t.Fatalf("write golden: %v", err)
		}
		t.Log("Golden file updated")
		return
	}

	golden, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("read golden file (run UPDATE_GOLDEN=1 go test ./schema/ -run TestEditorSchemasGoldenFile to create): %v", err)
	}

	// Normalize: unmarshal and remarshal both for stable comparison
	var goldenParsed editorSchemasGolden
	if err := json.Unmarshal(golden, &goldenParsed); err != nil {
		t.Fatalf("parse golden: %v", err)
	}
	goldenNorm, _ := json.MarshalIndent(goldenParsed, "", "  ")

	if string(currentJSON) != string(goldenNorm) {
		t.Fatalf("editor schemas have changed — update golden file with:\n  UPDATE_GOLDEN=1 go test ./schema/ -run TestEditorSchemasGoldenFile\n\nThen commit the updated golden file and re-run the workflow-editor sync.")
	}
}
```

**Step 3: Run the test**

Run: `cd /Users/jon/workspace/workflow && UPDATE_GOLDEN=1 go test ./schema/ -run TestEditorSchemasGoldenFile -v`
Expected: PASS, golden file created

Run: `cd /Users/jon/workspace/workflow && go test ./schema/ -run TestEditorSchemasGoldenFile -v`
Expected: PASS (golden matches current)

**Step 4: Commit**

```bash
cd /Users/jon/workspace/workflow
git add schema/editor_contract_test.go schema/testdata/editor-schemas.golden.json schema/coercion.go schema/coercion_test.go
git commit -m "feat(schema): add editor contract golden file test"
```

---

### Task 4: Strip `ui_position` from Serialization and Add Sidecar Layout

**Files:**
- Modify: `src/utils/serialization.ts:305-309` (remove `ui_position` write)
- Modify: `src/utils/serialization.ts:521-528` (remove `ui_position` read)
- Modify: `src/utils/serialization.ts:699-705` (always auto-layout if no sidecar)
- Create: `src/utils/layout-sidecar.ts`
- Create: `src/utils/layout-sidecar.test.ts`
- Modify: `src/utils/serialization.test.ts` (update tests that check `ui_position`)

Working directory: `/Users/jon/workspace/workflow-editor`

**Step 1: Write sidecar layout tests**

```typescript
// src/utils/layout-sidecar.test.ts
import { describe, it, expect } from 'vitest';
import { exportLayout, importLayout, type LayoutData } from './layout-sidecar';
import type { WorkflowNode } from '../stores/workflowStore';

const makeNode = (id: string, label: string, x: number, y: number): WorkflowNode => ({
  id,
  type: 'infrastructureNode',
  position: { x, y },
  data: { moduleType: 'test.type', label, config: {} },
});

describe('exportLayout', () => {
  it('exports node positions keyed by module label', () => {
    const nodes = [makeNode('1', 'my-server', 100, 200), makeNode('2', 'my-router', 300, 400)];
    const layout = exportLayout(nodes);
    expect(layout.version).toBe(1);
    expect(layout.positions['my-server']).toEqual({ x: 100, y: 200 });
    expect(layout.positions['my-router']).toEqual({ x: 300, y: 400 });
  });

  it('rounds positions to integers', () => {
    const nodes = [makeNode('1', 'srv', 100.7, 200.3)];
    const layout = exportLayout(nodes);
    expect(layout.positions['srv']).toEqual({ x: 101, y: 200 });
  });
});

describe('importLayout', () => {
  it('applies saved positions to matching nodes', () => {
    const nodes = [makeNode('1', 'my-server', 0, 0), makeNode('2', 'my-router', 0, 0)];
    const layout: LayoutData = {
      version: 1,
      positions: { 'my-server': { x: 100, y: 200 }, 'my-router': { x: 300, y: 400 } },
    };
    const result = importLayout(nodes, layout);
    expect(result.applied).toBe(true);
    expect(nodes[0].position).toEqual({ x: 100, y: 200 });
    expect(nodes[1].position).toEqual({ x: 300, y: 400 });
  });

  it('returns applied=false when no positions match', () => {
    const nodes = [makeNode('1', 'other', 0, 0)];
    const layout: LayoutData = { version: 1, positions: { 'missing': { x: 1, y: 2 } } };
    const result = importLayout(nodes, layout);
    expect(result.applied).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/jon/workspace/workflow-editor && npx vitest run src/utils/layout-sidecar.test.ts`
Expected: FAIL — module not found

**Step 3: Write the sidecar implementation**

```typescript
// src/utils/layout-sidecar.ts
import type { WorkflowNode } from '../stores/workflowStore';

export interface LayoutPosition {
  x: number;
  y: number;
}

export interface LayoutData {
  version: 1;
  positions: Record<string, LayoutPosition>;
}

export function exportLayout(nodes: WorkflowNode[]): LayoutData {
  const positions: Record<string, LayoutPosition> = {};
  for (const node of nodes) {
    positions[node.data.label] = {
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
    };
  }
  return { version: 1, positions };
}

export function importLayout(
  nodes: WorkflowNode[],
  layout: LayoutData,
): { applied: boolean } {
  let anyApplied = false;
  for (const node of nodes) {
    const saved = layout.positions[node.data.label];
    if (saved) {
      node.position = { x: saved.x, y: saved.y };
      anyApplied = true;
    }
  }
  return { applied: anyApplied };
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/jon/workspace/workflow-editor && npx vitest run src/utils/layout-sidecar.test.ts`
Expected: PASS

**Step 5: Remove `ui_position` from serialization.ts**

In `src/utils/serialization.ts`:

1. **Remove lines 305-309** (the `ui_position` write in `nodesToConfig()`):
   ```typescript
   // DELETE these lines:
   // Persist canvas position so layout survives save/load
   mod.ui_position = {
     x: Math.round(node.position.x),
     y: Math.round(node.position.y),
   };
   ```

2. **In `configToNodes()` (~line 521-528)**, remove `ui_position` reading:
   ```typescript
   // CHANGE: Remove savedPos logic. Always set position to {x:0, y:0} initially.
   // Layout is applied from sidecar file by the host (IDE plugin), or auto-layout runs.
   ```
   Replace:
   ```typescript
   const savedPos = mod.ui_position;
   if (savedPos) hasPositions = true;
   // ...
   position: savedPos ? { x: savedPos.x, y: savedPos.y } : { x: 0, y: 0 },
   ```
   With:
   ```typescript
   position: { x: 0, y: 0 },
   ```

3. **Remove `hasPositions` guard** (~line 699-705). Always run dagre layout after parsing (the host can override with sidecar positions after):
   ```typescript
   // CHANGE: Always apply dagre layout. Host overrides with sidecar after.
   const laid = layoutNodes(nodes, edges);
   for (let i = 0; i < nodes.length; i++) {
     nodes[i].position = laid[i].position;
   }
   ```

**Step 6: Update serialization tests**

In `src/utils/serialization.test.ts`, find and update any tests that:
- Assert `ui_position` exists in serialized output → assert it does NOT exist
- Rely on `ui_position` for position round-trip → remove or convert to sidecar tests

**Step 7: Run all tests**

Run: `cd /Users/jon/workspace/workflow-editor && npx vitest run`
Expected: PASS

**Step 8: Commit**

```bash
cd /Users/jon/workspace/workflow-editor
git add src/utils/layout-sidecar.ts src/utils/layout-sidecar.test.ts src/utils/serialization.ts src/utils/serialization.test.ts
git commit -m "feat: strip ui_position from YAML output, add sidecar layout file support"
```

---

### Task 5: Generate Engine Schemas File and Wire Into Editor

**Files:**
- Create: `src/generated/engine-schemas.json` (generated by wfctl)
- Modify: `src/stores/moduleSchemaStore.ts:150-195` (invert merge priority)
- Modify: `src/utils/connectionCompatibility.ts:9-63` (read from generated file)
- Create: `src/generated/load-schemas.ts`
- Create: `src/generated/load-schemas.test.ts`

Working directory: `/Users/jon/workspace/workflow-editor`

**Step 1: Generate the initial engine-schemas.json**

Run: `cd /Users/jon/workspace/workflow && mkdir -p ../workflow-editor/src/generated && ./wfctl editor-schemas --output ../workflow-editor/src/generated/engine-schemas.json`

**Step 2: Write schema loader**

```typescript
// src/generated/load-schemas.ts
import engineData from './engine-schemas.json';
import type { ModuleTypeInfo, IOPort } from '../types/workflow';

interface EngineModuleSchema {
  type: string;
  label: string;
  category: string;
  description?: string;
  inputs?: { name: string; type: string; description?: string }[];
  outputs?: { name: string; type: string; description?: string }[];
  configFields: any[];
  defaultConfig?: Record<string, unknown>;
  maxIncoming?: number | null;
  maxOutgoing?: number | null;
}

interface EngineSchemas {
  moduleSchemas: Record<string, EngineModuleSchema>;
  coercionRules: Record<string, string[]>;
}

const data = engineData as EngineSchemas;

function toIOPorts(defs?: { name: string; type: string }[]): IOPort[] {
  if (!defs) return [];
  return defs.map((d) => ({ name: d.name, type: d.type }));
}

export function getEngineModuleTypes(): Record<string, ModuleTypeInfo> {
  const result: Record<string, ModuleTypeInfo> = {};
  for (const [type, schema] of Object.entries(data.moduleSchemas)) {
    result[type] = {
      type: schema.type,
      label: schema.label,
      category: schema.category,
      configFields: schema.configFields ?? [],
      defaultConfig: schema.defaultConfig ?? {},
      ioSignature: {
        inputs: toIOPorts(schema.inputs),
        outputs: toIOPorts(schema.outputs),
      },
      maxIncoming: schema.maxIncoming,
      maxOutgoing: schema.maxOutgoing,
    };
  }
  return result;
}

export function getEngineCoercionRules(): Record<string, string[]> {
  return data.coercionRules;
}
```

**Step 3: Write test for schema loader**

```typescript
// src/generated/load-schemas.test.ts
import { describe, it, expect } from 'vitest';
import { getEngineModuleTypes, getEngineCoercionRules } from './load-schemas';

describe('getEngineModuleTypes', () => {
  it('loads http.server from engine schemas', () => {
    const types = getEngineModuleTypes();
    const server = types['http.server'];
    expect(server).toBeDefined();
    expect(server.label).toBe('HTTP Server');
    expect(server.category).toBe('http');
    expect(server.ioSignature?.outputs?.length).toBeGreaterThan(0);
  });

  it('loads all module types', () => {
    const types = getEngineModuleTypes();
    expect(Object.keys(types).length).toBeGreaterThan(50);
  });
});

describe('getEngineCoercionRules', () => {
  it('loads coercion rules', () => {
    const rules = getEngineCoercionRules();
    expect(rules['http.Request']).toContain('any');
    expect(Object.keys(rules).length).toBeGreaterThan(20);
  });
});
```

**Step 4: Run test**

Run: `cd /Users/jon/workspace/workflow-editor && npx vitest run src/generated/load-schemas.test.ts`
Expected: PASS

**Step 5: Wire into moduleSchemaStore.ts**

In `src/stores/moduleSchemaStore.ts`:

1. Import engine schemas at the top:
   ```typescript
   import { getEngineModuleTypes } from '../generated/load-schemas';
   ```

2. Modify `mergeSchemas()` (~line 150) to make engine schemas primary:
   - Change the merge so engine data overrides static `MODULE_TYPES` for ALL fields including `ioSignature`
   - Static `MODULE_TYPES` only fills in types that are NOT in the engine schemas (fallback for unknown/plugin types)

3. Initialize the store's `moduleTypeMap` from engine schemas instead of static MODULE_TYPES.

**Step 6: Wire coercion rules into connectionCompatibility.ts**

In `src/utils/connectionCompatibility.ts`:

1. Replace the hardcoded `COERCION_RULES` constant (~lines 9-63) with:
   ```typescript
   import { getEngineCoercionRules } from '../generated/load-schemas';
   const COERCION_RULES: Record<string, string[]> = getEngineCoercionRules();
   ```

2. Remove the 63 lines of hardcoded rules.

**Step 7: Run all tests**

Run: `cd /Users/jon/workspace/workflow-editor && npx vitest run`
Expected: PASS

**Step 8: Commit**

```bash
cd /Users/jon/workspace/workflow-editor
git add src/generated/ src/stores/moduleSchemaStore.ts src/utils/connectionCompatibility.ts
git commit -m "feat: derive connection rules and module schemas from engine-generated file"
```

---

### Task 6: Add Round-Trip Contract Tests with ajv

**Files:**
- Modify: `package.json` (add `ajv` devDependency)
- Create: `src/utils/serialization.contract.test.ts`

Working directory: `/Users/jon/workspace/workflow-editor`

**Step 1: Install ajv**

Run: `cd /Users/jon/workspace/workflow-editor && npm install --save-dev ajv ajv-formats`

**Step 2: Write contract tests**

```typescript
// src/utils/serialization.contract.test.ts
import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { configToNodes, nodesToConfig, configToYaml, parseYaml } from './serialization';
import { getEngineModuleTypes } from '../generated/load-schemas';
import configSchema from '../../schemas/workflow-config.schema.json';

function createValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(configSchema);
}

const moduleTypeMap = getEngineModuleTypes();

describe('serialization contract: round-trip produces valid engine configs', () => {
  const validate = createValidator();

  const configs: Record<string, string> = {
    'HTTP server + router': `
modules:
  - name: server
    type: http.server
    config:
      address: ":8080"
  - name: router
    type: http.router
workflows:
  http:
    server: server
    router: router
    routes: []
`,
    'Pipeline with steps': `
modules:
  - name: server
    type: http.server
    config:
      address: ":8080"
  - name: router
    type: http.router
pipelines:
  greet:
    trigger:
      type: http
      config:
        path: /greet
        method: GET
    steps:
      - name: set_greeting
        type: step.set
        config:
          values:
            message: hello
`,
    'State machine': `
modules:
  - name: server
    type: http.server
    config:
      address: ":8080"
  - name: order-sm
    type: statemachine.engine
    config:
      initial: pending
workflows:
  statemachine:
    engine: order-sm
    states:
      pending:
        on:
          approve: approved
      approved: {}
`,
    'Conditional routing': `
modules:
  - name: server
    type: http.server
    config:
      address: ":8080"
  - name: router
    type: http.router
pipelines:
  check:
    trigger:
      type: http
      config:
        path: /check
        method: POST
    steps:
      - name: parse
        type: step.request_parse
      - name: branch
        type: step.conditional
        config:
          field: steps.parse.body.action
          routes:
            approve: handle_approve
            reject: handle_reject
          default: handle_approve
      - name: handle_approve
        type: step.set
        config:
          values:
            status: approved
      - name: handle_reject
        type: step.set
        config:
          values:
            status: rejected
`,
    'Middleware chain': `
modules:
  - name: server
    type: http.server
    config:
      address: ":8080"
  - name: cors
    type: http.middleware.cors
    config:
      allowedOrigins:
        - "*"
  - name: router
    type: http.router
workflows:
  http:
    server: server
    router: router
    middleware:
      - cors
    routes: []
`,
    'Database module': `
modules:
  - name: server
    type: http.server
    config:
      address: ":8080"
  - name: db
    type: database.workflow
    config:
      driver: sqlite3
      dsn: ":memory:"
  - name: router
    type: http.router
pipelines:
  users:
    trigger:
      type: http
      config:
        path: /users
        method: GET
    steps:
      - name: query
        type: step.db_query
        config:
          module: db
          query: "SELECT id, name FROM users"
          mode: list
`,
    'Messaging workflow': `
modules:
  - name: server
    type: http.server
    config:
      address: ":8080"
  - name: broker
    type: messaging.memory
  - name: router
    type: http.router
workflows:
  messaging:
    broker: broker
    subscriptions:
      - topic: events
        handler: log_event
`,
    'Scheduler': `
modules:
  - name: server
    type: http.server
    config:
      address: ":8080"
  - name: scheduler
    type: scheduler.modular
  - name: router
    type: http.router
workflows:
  scheduler:
    module: scheduler
    jobs:
      - name: cleanup
        schedule: "*/5 * * * *"
        pipeline: cleanup_job
pipelines:
  cleanup_job:
    steps:
      - name: log
        type: step.set
        config:
          values:
            ran: true
`,
    'Observability': `
modules:
  - name: server
    type: http.server
    config:
      address: ":8080"
  - name: otel
    type: observability.otel
    config:
      serviceName: test-app
      endpoint: localhost:4317
  - name: router
    type: http.router
workflows:
  http:
    server: server
    router: router
    routes: []
`,
    'Storage + static files': `
modules:
  - name: server
    type: http.server
    config:
      address: ":8080"
  - name: store
    type: storage.sqlite
    config:
      dbPath: app.db
  - name: static
    type: static.fileserver
    config:
      root: ./ui/dist
      prefix: /ui
      spaFallback: true
  - name: router
    type: http.router
workflows:
  http:
    server: server
    router: router
    routes: []
`,
  };

  for (const [name, yaml] of Object.entries(configs)) {
    it(`round-trips "${name}" without adding editor metadata`, () => {
      const parsed = parseYaml(yaml);
      const { nodes, edges } = configToNodes(parsed, moduleTypeMap);
      const serialized = nodesToConfig(nodes, edges);
      const output = configToYaml(serialized);

      // Must not contain editor-specific fields
      expect(output).not.toContain('ui_position');
      expect(output).not.toContain('_editor');
    });

    it(`round-trips "${name}" producing valid engine config`, () => {
      const parsed = parseYaml(yaml);
      const { nodes, edges } = configToNodes(parsed, moduleTypeMap);
      const serialized = nodesToConfig(nodes, edges);

      const valid = validate(serialized);
      if (!valid) {
        const errors = validate.errors?.map((e) => `${e.instancePath} ${e.message}`).join('\n');
        expect.fail(`Config invalid after round-trip:\n${errors}`);
      }
    });

    it(`round-trip snapshot for "${name}" is stable`, () => {
      const parsed = parseYaml(yaml);
      const { nodes, edges } = configToNodes(parsed, moduleTypeMap);
      const serialized = nodesToConfig(nodes, edges);
      const output = configToYaml(serialized);
      expect(output).toMatchSnapshot();
    });
  }
});
```

**Step 3: Run contract tests**

Run: `cd /Users/jon/workspace/workflow-editor && npx vitest run src/utils/serialization.contract.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
cd /Users/jon/workspace/workflow-editor
git add package.json package-lock.json src/utils/serialization.contract.test.ts
git commit -m "feat: add round-trip contract tests validating output against engine schema"
```

---

### Task 7: Update sync-schema.yml to Run Tests and Export Editor Schemas

**Files:**
- Modify: `.github/workflows/sync-schema.yml`

Working directory: `/Users/jon/workspace/workflow-editor`

**Step 1: Update the workflow**

Add two new steps after the existing "Regenerate schema" step (~line 35) and before "Update editor package":

```yaml
      - name: Export editor schemas
        run: wfctl editor-schemas --output src/generated/engine-schemas.json

      - name: Run contract tests
        run: |
          npm ci
          npx vitest run
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Move the `npm ci` that might already exist later in the workflow to this earlier position, or ensure it runs before tests.

**Step 2: Verify the workflow syntax**

Run: `cd /Users/jon/workspace/workflow-editor && cat .github/workflows/sync-schema.yml` (manual review)

**Step 3: Commit**

```bash
cd /Users/jon/workspace/workflow-editor
git add .github/workflows/sync-schema.yml
git commit -m "ci: run contract tests in sync-schema workflow before publishing"
```

---

### Task 8: Add Sidecar Support to VS Code Plugin

**Files:**
- Modify: `src/visual-editor.ts:46-121` (add sidecar read/write to message handling)

Working directory: `/Users/jon/workspace/workflow-vscode`

**Step 1: Add sidecar file handling**

In `src/visual-editor.ts`, in the `setupMessageHandling()` method:

1. Add a `saveFiles` or `layoutChanged` message handler that writes the sidecar JSON:
   ```typescript
   case 'layoutChanged': {
     const yamlUri = this.document.uri;
     const sidecarUri = vscode.Uri.file(yamlUri.fsPath.replace(/\.ya?ml$/, '.workflow-editor.json'));
     const content = new TextEncoder().encode(JSON.stringify(msg.layout, null, 2));
     await vscode.workspace.fs.writeFile(sidecarUri, content);
     break;
   }
   ```

2. In the `sendYamlToEditor()` method, also check for and send the sidecar file:
   ```typescript
   const sidecarUri = vscode.Uri.file(uri.fsPath.replace(/\.ya?ml$/, '.workflow-editor.json'));
   try {
     const sidecarContent = await vscode.workspace.fs.readFile(sidecarUri);
     this.panel.webview.postMessage({ type: 'layoutLoaded', layout: JSON.parse(new TextDecoder().decode(sidecarContent)) });
   } catch {
     // No sidecar file — editor will use auto-layout
   }
   ```

**Step 2: Add `.workflow-editor.json` to .gitignore suggestion**

Check if there's a `.gitignore` recommendation in the extension. If so, add `.workflow-editor.json`. Otherwise, note this as a documentation item for users.

**Step 3: Commit**

```bash
cd /Users/jon/workspace/workflow-vscode
git add src/visual-editor.ts
git commit -m "feat: read/write layout sidecar file instead of polluting YAML config"
```

---

### Task 9: Add Sidecar Support to JetBrains Plugin

**Files:**
- Modify: `src/main/kotlin/com/gocodalone/workflow/ide/editor/WorkflowBridge.kt:107-119` (add sidecar read/write)

Working directory: `/Users/jon/workspace/workflow-jetbrains`

**Step 1: Add sidecar handling in WorkflowBridge.kt**

1. Add a `layoutChanged` handler in the JS bridge setup (~line 80-105) that writes the sidecar JSON file:
   ```kotlin
   // In bridge initialization, add handler for layout changes:
   val layoutQuery = JBCefJSQuery.create(browser as JBCefBrowserBase)
   layoutQuery.addHandler { layoutJson ->
       val yamlPath = currentFile?.path ?: return@addHandler null
       val sidecarPath = yamlPath.replace(Regex("\\.ya?ml$"), ".workflow-editor.json")
       File(sidecarPath).writeText(layoutJson)
       null
   }
   ```

2. In `sendYamlToEditor()` (~line 107-119), also send the sidecar file if it exists:
   ```kotlin
   val sidecarPath = currentFile?.path?.replace(Regex("\\.ya?ml$"), ".workflow-editor.json")
   if (sidecarPath != null) {
       val sidecarFile = File(sidecarPath)
       if (sidecarFile.exists()) {
           val escaped = sidecarFile.readText().replace("\\", "\\\\").replace("`", "\\`").replace("$", "\\$")
           browser.cefBrowser.executeJavaScript("window.onLayoutLoaded && window.onLayoutLoaded(JSON.parse(`$escaped`))", null, 0)
       }
   }
   ```

**Step 2: Add `.workflow-editor.json` to .gitignore suggestion**

If there's a `.gitignore` template or recommendation in the JetBrains plugin (e.g., in docs or a project initializer), add `.workflow-editor.json`. Otherwise, add a note in the README that users should add `.workflow-editor.json` to their `.gitignore`.

**Step 3: Commit**

```bash
cd /Users/jon/workspace/workflow-jetbrains
git add src/main/kotlin/com/gocodalone/workflow/ide/editor/WorkflowBridge.kt
git commit -m "feat: read/write layout sidecar file instead of polluting YAML config"
```

---

### Task 10: Add Layout Message Handling in Editor Library

**Files:**
- Modify: `src/stores/workflowStore.ts` (add layout import/export actions)

Working directory: `/Users/jon/workspace/workflow-editor`

The editor library needs to expose layout import/export so IDE hosts can call it.

**Step 1: Add layout actions to workflowStore**

In `src/stores/workflowStore.ts`, add two new actions:

```typescript
import { exportLayout, importLayout, type LayoutData } from '../utils/layout-sidecar';

// In the store actions:
exportLayout: (): LayoutData => {
  return exportLayout(get().nodes);
},

importLayoutData: (layout: LayoutData) => {
  const nodes = [...get().nodes];
  const { applied } = importLayout(nodes, layout);
  if (applied) {
    set({ nodes });
  }
},
```

These are called by the host (VS Code / JetBrains) after loading the YAML and sidecar file.

**Step 2: Ensure `importFromConfig` no longer reads `ui_position`**

Verify that `configToNodes()` (modified in Task 4) no longer reads `ui_position`. The host calls `importLayoutData()` after `importFromConfig()` if a sidecar exists.

**Step 3: Ensure node drag emits layout change**

In the existing `onNodesChange` handler, after position changes are applied, the host should be notified. Add a callback or message post:

```typescript
// After applying node changes that include position:
if (changes.some(c => c.type === 'position')) {
  // Notify host to save sidecar
  window.postMessage({ type: 'layoutChanged', layout: exportLayout(get().nodes) }, '*');
}
```

**Step 4: Run tests**

Run: `cd /Users/jon/workspace/workflow-editor && npx vitest run`
Expected: PASS

**Step 5: Commit**

```bash
cd /Users/jon/workspace/workflow-editor
git add src/stores/workflowStore.ts
git commit -m "feat: expose layout import/export actions for IDE host sidecar integration"
```

---

### Task 11: Tag and Release

**Step 1: Tag workflow repo changes**

```bash
cd /Users/jon/workspace/workflow
# Ensure all tests pass
go test ./schema/ -v
# The next engine release (v0.3.49) will include editor-schemas command
```

**Step 2: Tag workflow-editor**

```bash
cd /Users/jon/workspace/workflow-editor
npx vitest run
# Bump version and tag (the sync workflow handles this normally,
# but for this initial release we do it manually)
npm version minor --no-git-tag-version
git add -A
git commit -m "feat: editor-engine contract enforcement v0.5.0"
git tag v0.5.0
git push origin main --tags
```

**Step 3: Verify dispatch chain fires**

After tagging, monitor:
- `workflow-editor` publish workflow runs
- `workflow-vscode` and `workflow-jetbrains` sync-editor workflows trigger
- Both IDE plugins build and tag successfully
