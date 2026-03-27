# Editor Completeness Phases 3-5 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** DSL reference documentation, step schema export, JSON field audit/fix in engine, DSL reference pane in editor, LSP-powered hover/completion in both IDEs.

**Architecture:** DSL reference markdown lives in workflow repo, extracted to `dsl-reference.json` at build time, consumed by workflow-editor's reference pane and the LSP server's hover responses. Step schemas added to `wfctl editor-schemas` output. LSP hover/completion in `workflow-lsp-server` (Go) surfaces in both VS Code and JetBrains with zero plugin changes.

**Tech Stack:** Go (workflow engine, LSP), TypeScript/React (workflow-editor), TypeScript (VS Code extension), Kotlin (JetBrains plugin)

**Design Doc:** `docs/plans/2026-03-27-editor-completeness-design.md`

**Repos:**
- `/Users/jon/workspace/workflow` — engine, wfctl, LSP server, DSL reference
- `/Users/jon/workspace/workflow-editor` — DSL reference pane, step schema consumption
- `/Users/jon/workspace/workflow-vscode` — DSL reference command, updated schema sync
- `/Users/jon/workspace/workflow-jetbrains` — DSL reference command

---

## Phase 3: DSL Reference

### Task 1: Create canonical DSL reference markdown

**Repo:** workflow
**Files:**
- Create: `docs/dsl-reference.md`

Write the authoritative DSL reference covering each top-level YAML section. Each section uses this structure:

```markdown
<!-- section: modules -->
## Modules

Modules are the building blocks of a workflow application. Each module represents
a runtime service component (HTTP server, database connection, message broker, etc.).

### Required Fields
- `name` (string) — unique identifier for this module instance
- `type` (string) — module type from the registry (e.g., `http.server`, `database.workflow`)

### Optional Fields
- `config` (map) — type-specific configuration
- `dependsOn` (string[]) — module names this module depends on (controls init order)
- `branches` (map) — conditional routing to other modules

### Example
\```yaml
modules:
  - name: api-server
    type: http.server
    config:
      address: ":8080"
  - name: db
    type: database.workflow
    config:
      driver: postgres
      dsn: "${DATABASE_URL}"
    dependsOn:
      - api-server
\```

### Relationship to Other Sections
- Modules are referenced by `workflows.http.routes[].handler`
- Modules can reference pipelines via their config
- Module names must be unique across all imported files
```

Sections to cover (in order):
1. **Application** — top-level `name`, `version`, `requires`
2. **Modules** — as above
3. **Workflows** — parent section for http, messaging, statemachine, event
4. **Workflows > HTTP** — server, router, routes, middleware chains
5. **Workflows > Messaging** — broker, subscriptions, topics
6. **Workflows > State Machine** — engine, definitions, transitions
7. **Workflows > Events** — processor, handlers, adapters
8. **Pipelines** — steps array, step types, template expressions, flow control
9. **Triggers** — HTTP triggers (inline), cron triggers, event triggers
10. **Imports** — file splitting, merge behavior, sourceMap implications
11. **Config Providers** — type: defaults, type: env, type: file
12. **Platform / Infrastructure / Sidecars** — IaC sections

Each section has the `<!-- section: name -->` HTML comment for machine parsing.

**Step 1:** Write the full DSL reference.

**Step 2:** Commit:
```bash
cd /Users/jon/workspace/workflow
git add docs/dsl-reference.md
git commit -m "docs: canonical DSL reference for workflow YAML spec"
```

---

### Task 2: Create dsl-reference.json extraction script

**Repo:** workflow
**Files:**
- Create: `cmd/wfctl/dsl_reference.go`
- Modify: `cmd/wfctl/main.go` — register `dsl-reference` subcommand

Add a `wfctl dsl-reference` command that parses `docs/dsl-reference.md` and outputs JSON:

```go
type DSLReferenceOutput struct {
    Sections []DSLSection `json:"sections"`
}

type DSLSection struct {
    ID             string       `json:"id"`             // "modules", "workflows-http", etc.
    Title          string       `json:"title"`          // "Modules"
    Description    string       `json:"description"`    // First paragraph
    RequiredFields []FieldDoc   `json:"requiredFields"`
    OptionalFields []FieldDoc   `json:"optionalFields"`
    Example        string       `json:"example"`        // YAML code block
    Relationships  []string     `json:"relationships"`  // Bullet points from "Relationship" section
    Parent         string       `json:"parent,omitempty"` // e.g., "workflows" for "workflows-http"
}

type FieldDoc struct {
    Name        string `json:"name"`
    Type        string `json:"type"`
    Description string `json:"description"`
}
```

The parser:
1. Reads `docs/dsl-reference.md` (embedded via `//go:embed`)
2. Splits on `## ` headers
3. Extracts fields from `### Required Fields` / `### Optional Fields` bullet lists
4. Extracts YAML from fenced code blocks
5. Extracts relationships from `### Relationship` section
6. Outputs JSON to stdout

**Step 1:** Write `dsl_reference.go` with the parser and types.

**Step 2:** Register in main.go alongside other subcommands.

**Step 3:** Test: `go run ./cmd/wfctl dsl-reference | jq .sections[0]`

**Step 4:** Commit:
```bash
cd /Users/jon/workspace/workflow
git add cmd/wfctl/dsl_reference.go cmd/wfctl/main.go
git commit -m "feat: wfctl dsl-reference command — extracts DSL reference as JSON"
```

---

### Task 3: Add step schemas to wfctl editor-schemas output

**Repo:** workflow
**Files:**
- Modify: `cmd/wfctl/editor_schemas.go`
- Modify: `schema/step_schema.go` (if StepSchemaRegistry needs export)

Currently `editor-schemas` only exports `moduleSchemas` + `coercionRules`. Add `stepSchemas`:

```go
type editorSchemasOutput struct {
    ModuleSchemas map[string]*schema.ModuleSchema `json:"moduleSchemas"`
    StepSchemas   map[string]*schema.StepSchema   `json:"stepSchemas"`
    CoercionRules map[string][]string              `json:"coercionRules"`
}
```

In the command handler:
```go
stepRegistry := schema.NewStepSchemaRegistry()
output := editorSchemasOutput{
    ModuleSchemas: moduleRegistry.All(),
    StepSchemas:   stepRegistry.All(),
    CoercionRules: coercionRegistry.Rules(),
}
```

If `StepSchemaRegistry` doesn't have an `All()` method, add one:
```go
func (r *StepSchemaRegistry) All() map[string]*StepSchema {
    return r.schemas
}
```

**Step 1:** Add `All()` to StepSchemaRegistry if missing.

**Step 2:** Update `editor_schemas.go` to include step schemas.

**Step 3:** Test: `go run ./cmd/wfctl editor-schemas | jq '.stepSchemas | keys | length'`

**Step 4:** Commit:
```bash
cd /Users/jon/workspace/workflow
git add cmd/wfctl/editor_schemas.go schema/step_schema.go
git commit -m "feat: include step schemas in wfctl editor-schemas output"
```

---

### Task 4: DSL Reference pane component in workflow-editor

**Repo:** workflow-editor
**Files:**
- Create: `src/components/reference/DslReferencePane.tsx`
- Create: `src/components/reference/DslReferencePane.test.tsx`
- Create: `src/generated/dsl-reference.json` (initially hand-crafted from the markdown, later auto-synced)
- Modify: `src/components/WorkflowEditor.tsx` — add reference pane toggle
- Modify: `src/types/editor.ts` — add `showDslReference?: boolean` prop

The DSL Reference pane:

```typescript
interface DslReferencePaneProps {
  visible: boolean;
  sections: DSLSection[];
  activeSection?: string;  // auto-set based on selected node
  onClose: () => void;
}

interface DSLSection {
  id: string;
  title: string;
  description: string;
  requiredFields: Array<{ name: string; type: string; description: string }>;
  optionalFields: Array<{ name: string; type: string; description: string }>;
  example: string;
  relationships: string[];
  parent?: string;
}
```

Features:
- Collapsible sidebar pane with book icon toggle in toolbar
- Section list with collapsible subsections (workflows > http, messaging, etc.)
- **Context-sensitive:** when selected node changes, auto-scroll to relevant section:
  - `http.server` / `http.router` / `http.middleware.*` → "workflows-http"
  - `messaging.*` → "workflows-messaging"
  - `database.*` → "modules" (generic)
  - `step.*` synthesized nodes → "pipelines"
  - No selection → "application"
- YAML example blocks rendered with syntax highlighting (reuse YamlLineRenderer)
- Shares right panel area as a tab alongside YAML pane

Tests:
- Renders section titles from provided data
- Auto-scrolls to correct section when activeSection changes
- Clicking a section expands it
- Close button calls onClose
- Empty sections array renders "No reference available"

**Step 1:** Create `dsl-reference.json` with a few representative sections.

**Step 2:** Write tests.

**Step 3:** Implement DslReferencePane.

**Step 4:** Add toggle to WorkflowEditor toolbar + `showDslReference` prop.

**Step 5:** Run all tests: `npx vitest run`

**Step 6:** Commit:
```bash
git add src/components/reference/ src/generated/dsl-reference.json src/components/WorkflowEditor.tsx src/types/editor.ts
git commit -m "feat: DSL reference pane — context-sensitive documentation sidebar"
```

---

## Phase 4: Typed Schema Improvements

### Task 5: Audit and fix json-typed fields in engine schemas

**Repo:** workflow
**Files:**
- Modify: `schema/module_schema.go` — fix json-typed ConfigFieldDefs
- Modify: `schema/step_schema_builtins.go` — fix json-typed step ConfigFieldDefs

The JSON audit (from Phase 1 Task 5) identified ~60 json-typed fields. For each one:
1. Check if the field has a known structure (e.g., `routes` is `[]RouteConfig`, `tls` is `TLSConfig`)
2. If structured: replace `FieldTypeJSON` with nested fields or a more specific type
3. If truly dynamic (arbitrary user JSON): keep as `FieldTypeJSON` but add `defaultValue` with an example

Priority targets (fields used by many module types):
- `config` catch-all fields → break into specific typed sub-fields
- `routes` on `http.router` → should be `FieldTypeArray` with sub-schema
- `tls` configs → should be nested fields (mode, certFile, keyFile)
- `headers` maps → `FieldTypeMap`
- `metadata` / `labels` → `FieldTypeMap`

This is incremental — don't try to fix all 60 in one pass. Fix the top 20 most-used ones.

**Step 1:** Run `go run ./cmd/wfctl editor-schemas | jq '[.moduleSchemas | to_entries[] | .value.configFields[]? | select(.type == "json")] | length'` to get current count.

**Step 2:** Fix the top 20 json fields in `module_schema.go` and `step_schema_builtins.go`.

**Step 3:** Re-run the count to verify reduction.

**Step 4:** Run `go test ./schema/...` to verify no regressions.

**Step 5:** Commit:
```bash
cd /Users/jon/workspace/workflow
git add schema/module_schema.go schema/step_schema_builtins.go
git commit -m "fix: convert 20 json-typed config fields to proper typed schemas"
```

---

### Task 6: CI contract test — no new json fields

**Repo:** workflow
**Files:**
- Create: `schema/schema_contract_test.go`

```go
func TestNoNewJSONFields(t *testing.T) {
    moduleRegistry := NewModuleSchemaRegistry()
    stepRegistry := NewStepSchemaRegistry()

    var jsonFields []string

    for typeName, schema := range moduleRegistry.All() {
        for _, field := range schema.ConfigFields {
            if field.Type == FieldTypeJSON {
                jsonFields = append(jsonFields, typeName+"."+field.Key)
            }
        }
    }
    for typeName, schema := range stepRegistry.All() {
        for _, field := range schema.ConfigFields {
            if field.Type == FieldTypeJSON {
                jsonFields = append(jsonFields, typeName+"."+field.Key)
            }
        }
    }

    // Ratchet: count should only decrease over time
    // Update this number as fields are converted to typed schemas
    // When STRICT_SCHEMA is set, zero json fields allowed
    if os.Getenv("STRICT_SCHEMA") == "true" {
        if len(jsonFields) > 0 {
            t.Errorf("STRICT_SCHEMA: %d json fields remain (must be 0):\n%s",
                len(jsonFields), strings.Join(jsonFields, "\n"))
        }
        return
    }

    // Ratchet: count should only decrease over time
    maxAllowed := 40  // was 60, reduced by Task 5
    if len(jsonFields) > maxAllowed {
        t.Errorf("JSON field count increased to %d (max allowed: %d). New json fields:\n%s",
            len(jsonFields), maxAllowed, strings.Join(jsonFields, "\n"))
    }

    t.Logf("Current JSON field count: %d / %d allowed", len(jsonFields), maxAllowed)
}
```

**Step 1:** Write the contract test.

**Step 2:** Run: `cd /Users/jon/workspace/workflow && go test ./schema/ -run TestNoNewJSONFields -v`

**Step 3:** Commit:
```bash
git add schema/schema_contract_test.go
git commit -m "test: CI contract — ratchet on json-typed schema fields"
```

---

### Task 7: Sync updated engine-schemas.json to workflow-editor

**Repo:** workflow + workflow-editor
**Files:**
- Run: `wfctl editor-schemas` in workflow repo
- Update: `src/generated/engine-schemas.json` in workflow-editor

**Step 1:** Generate updated schemas:
```bash
cd /Users/jon/workspace/workflow
go run ./cmd/wfctl editor-schemas > /Users/jon/workspace/workflow-editor/src/generated/engine-schemas.json
```

**Step 2:** Verify the new format includes `stepSchemas`:
```bash
cd /Users/jon/workspace/workflow-editor
node -e "const d=require('./src/generated/engine-schemas.json'); console.log('modules:', Object.keys(d.moduleSchemas).length, 'steps:', Object.keys(d.stepSchemas || {}).length)"
```

**Step 3:** Update `src/generated/load-schemas.ts` to export step schemas:
```typescript
export function getEngineStepTypes(): Record<string, StepTypeInfo> {
    // Map stepSchemas to StepTypeInfo (similar to module mapping)
}
```

**Step 4:** Run tests to verify no regressions: `npx vitest run`

**Step 5:** Update the JSON audit test (Task 5 from Phase 1) — the count should be lower now.

**Step 6:** Commit in workflow-editor:
```bash
git add src/generated/engine-schemas.json src/generated/load-schemas.ts
git commit -m "chore: sync engine-schemas.json with step schemas + reduced json fields"
```

---

## Phase 5: IDE Integration

### Task 8: LSP hover documentation for DSL sections

**Repo:** workflow
**Files:**
- Modify: `cmd/workflow-lsp-server/` (or wherever the LSP server lives)

Implement `textDocument/hover` responses for workflow YAML keys. When the cursor is on:
- `modules:` → return the "Modules" section description from dsl-reference.md
- `workflows:` → return the "Workflows" section description
- `pipelines:` → return the "Pipelines" section description
- `type: http.server` → return the module schema description + config fields summary
- `type: step.db_query` → return the step schema description + config fields summary

The LSP server should:
1. Embed `docs/dsl-reference.md` via `//go:embed`
2. Parse it once at startup (reuse the Task 2 parser)
3. On hover request: determine cursor context (which YAML key/value), look up in the reference + schema registries, return markdown

**Step 1:** Find the LSP server source. If it doesn't exist yet, create a minimal one at `cmd/workflow-lsp-server/main.go`.

**Step 2:** Add hover handler that returns DSL documentation.

**Step 3:** Test by running the LSP manually and sending a hover request.

**Step 4:** Commit:
```bash
cd /Users/jon/workspace/workflow
git add cmd/workflow-lsp-server/
git commit -m "feat: LSP hover documentation for workflow YAML DSL sections and types"
```

---

### Task 9: LSP completion with DSL descriptions

**Repo:** workflow
**Files:**
- Modify: `cmd/workflow-lsp-server/` — add completion handler

Implement `textDocument/completion` for:
- Top-level keys: `modules`, `workflows`, `pipelines`, `triggers`, `imports`, `requires`, `platform`, `infrastructure`, `sidecars` — with DSL reference descriptions
- Module type values: when cursor is at `type: |`, suggest all known module types with labels + descriptions from schema
- Step type values: when cursor is at `type: step.|`, suggest all step types
- Config keys: when cursor is inside a module's `config:` block and the module type is known, suggest that type's config field keys with descriptions

**Step 1:** Add completion handler to the LSP server.

**Step 2:** Test completions in VS Code (install the updated LSP binary).

**Step 3:** Commit:
```bash
cd /Users/jon/workspace/workflow
git add cmd/workflow-lsp-server/
git commit -m "feat: LSP completion for workflow YAML — types, config keys, DSL sections"
```

---

### Task 10: DSL reference command in VS Code

**Repo:** workflow-vscode
**Files:**
- Modify: `package.json` — add `workflow.openDslReference` command
- Create: `src/dsl-reference.ts` — WebviewViewProvider for sidebar
- Modify: `src/extension.ts` — register the command + view

Add `Workflow: Show DSL Reference` to the command palette:
- Opens a webview panel (or sidebar view) that renders the DSL reference
- Loads `dsl-reference.json` from the bundled schema directory
- Renders sections with collapsible headers, field tables, YAML examples

The simplest implementation: create a `WebviewViewProvider` registered to a view in the existing `workflow-explorer` viewContainer. The HTML is server-rendered from the JSON — no React needed, just styled HTML.

**Step 1:** Add command and view to `package.json` contributes.

**Step 2:** Create `dsl-reference.ts` with the WebviewViewProvider.

**Step 3:** Register in `extension.ts`.

**Step 4:** Build and test: `npm run compile`

**Step 5:** Commit:
```bash
cd /Users/jon/workspace/workflow-vscode
git add package.json src/dsl-reference.ts src/extension.ts
git commit -m "feat: Workflow: Show DSL Reference command + sidebar view"
```

---

### Task 11: DSL reference command in JetBrains

**Repo:** workflow-jetbrains
**Files:**
- Create: `src/main/kotlin/com/gocodalone/workflow/ide/editor/DslReferenceToolWindowFactory.kt`
- Modify: `src/main/resources/META-INF/plugin.xml` — register tool window
- Create: `src/main/kotlin/com/gocodalone/workflow/ide/editor/DslReferencePanel.kt`

Add a `Workflow DSL Reference` tool window:
- Registered in plugin.xml with `anchor="bottom"` or alongside the visual editor
- Uses `JBCefBrowser` to render the same HTML as VS Code (reuse the template)
- Loads `dsl-reference.json` from the bundled resources directory
- Alternative: use a Swing `JEditorPane` with HTML for simpler implementation

Also add an action `ShowDslReferenceAction` accessible from the Tools menu.

**Step 1:** Create the tool window factory.

**Step 2:** Create the HTML rendering panel.

**Step 3:** Register in plugin.xml.

**Step 4:** Build and test: `./gradlew build`

**Step 5:** Commit:
```bash
cd /Users/jon/workspace/workflow-jetbrains
git add src/main/kotlin/com/gocodalone/workflow/ide/editor/DslReferenceToolWindowFactory.kt src/main/kotlin/com/gocodalone/workflow/ide/editor/DslReferencePanel.kt src/main/resources/META-INF/plugin.xml
git commit -m "feat: Workflow DSL Reference tool window"
```

---

### Task 12: Breadcrumb IDE wiring + sync CI

**Repos:** workflow-vscode, workflow-jetbrains, workflow-editor
**Files:**
- Modify: `/Users/jon/workspace/workflow-vscode/webview-src/index.tsx` — wire breadcrumb onNavigate to bridge
- Modify: `/Users/jon/workspace/workflow-vscode/src/visual-editor.ts` — handle breadcrumb navigation message
- Modify: `/Users/jon/workspace/workflow-jetbrains/webview-src/index.tsx` — same
- Modify: `/Users/jon/workspace/workflow-jetbrains/src/main/kotlin/com/gocodalone/workflow/ide/editor/WorkflowBridge.kt` — handle breadcrumb navigation

The BreadcrumbBar (Task 6 from Phase 2) renders inside the `WorkflowEditor` component. When `onNavigate` fires, it already calls `onNavigateToSource(filePath, 1, 0)`. Both IDE plugins already handle `onNavigateToSource` with the multi-file overload (from the previous agent team). So breadcrumb clicks in the visual editor already work in IDEs — no additional wiring needed for basic navigation.

However, add explicit handling:
1. **VS Code**: When breadcrumb navigates to a different file, ensure the YAML text editor also switches to that file (not just the webview)
2. **JetBrains**: Same — `navigateToFileAndLine` already handles this from the previous work
3. **Sync CI**: Update workflow-editor's `sync-schema.yml` GitHub Action to also copy `dsl-reference.json` alongside `engine-schemas.json` when dispatched from a workflow release

**Step 1:** Verify breadcrumb already works in IDEs (it should — the bridge is already wired).

**Step 2:** Add `dsl-reference.json` to the `sync-schema.yml` workflow.

**Step 3:** Commit:
```bash
cd /Users/jon/workspace/workflow-editor
git add .github/workflows/sync-schema.yml
git commit -m "ci: add dsl-reference.json to schema sync workflow"
```

---

## Alignment Notes

**Intentional scope decisions (deferred to future major version):**
- `pkg/schema/` struct-tag reflection generator — deferred. Task 5 directly edits schema definitions which achieves the same immediate goal. The full generator is a major version bump scope item requiring struct tag changes on every module config.
- Major version bump — deferred until all json fields are eliminated. Task 6's ratchet test ensures count only decreases.
- Removing `MODULE_TYPES` static fallback — deferred until engine schema is confirmed authoritative across all consumers.

**Addressed drift items:**
- Task 2 also serves as `wfctl docs` (JSON output can be piped to a renderer; human-facing rendering is lower priority than machine-parseable extraction)
- Task 6 updated: includes `STRICT_SCHEMA=true` env var gate (see below)
- Tasks 10+11: IDE reference commands reuse `dsl-reference.json` via webview bridge where the existing `WorkflowEditor` component is already mounted, rather than duplicating rendering
- Task 12 added: breadcrumb IDE wiring + sync CI

---

## Summary

| Task | Phase | Repo | Type |
|------|-------|------|------|
| 1 | 3 | workflow | DSL reference markdown |
| 2 | 3 | workflow | wfctl dsl-reference command |
| 3 | 3 | workflow | Step schemas in editor-schemas |
| 4 | 3 | workflow-editor | DSL reference pane component |
| 5 | 4 | workflow | Audit/fix 20 json-typed fields |
| 6 | 4 | workflow | CI contract test for json fields |
| 7 | 4 | workflow + editor | Sync updated schemas |
| 8 | 5 | workflow | LSP hover documentation |
| 9 | 5 | workflow | LSP completion |
| 10 | 5 | workflow-vscode | DSL reference command |
| 11 | 5 | workflow-jetbrains | DSL reference tool window |
| 12 | 5 | vscode + jetbrains + editor | Breadcrumb IDE wiring + sync CI |
