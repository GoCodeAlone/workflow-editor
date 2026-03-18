# Iteration Log

## Known Issues

- ~~**MEDIUM / ide**: JetBrains missing `cursorMoved`~~ — FIXED iteration 5
- **LOW / ide**: JetBrains missing `aiResponse` — clipboard+notification is correct behavior (JetBrains AI Assistant has no public programmatic API like VS Code's `vscode.lm`). Not fixable without JetBrains exposing an API.
- ~~**MEDIUM / ide**: JetBrains missing `ready` handshake~~ — FIXED iteration 4
- ~~**MEDIUM / schema**: `api.command` and `api.query` render as generic InfrastructureNode~~ — FIXED iteration 3
- ~~**LOW / completeness**: `database.modular` phantom type~~ — FIXED iteration 6 (removed from MODULE_TYPES)
- ~~**MEDIUM / serialization**: Top-level `pipelines:` section dropped during round-trip~~ — FIXED iteration 7 (`nodesToConfig` now accepts `originalConfig` for pass-through)
- **LOW / completeness**: 8 database types, 32 infrastructure types, 3 platform types have no specialized node components (all fall to generic InfrastructureNode).
- **LOW / completeness**: 168 of 272 engine module types have no IO definitions (inputs/outputs). Most are step types — expected behavior.
- ~~**ENHANCEMENT / completeness**: No pipeline configs in real-world tests~~ — FIXED iteration 6 (added webhook-pipeline + test-route-pipeline)
- **ENHANCEMENT / gap**: E2E test suite (`e2e/editor.spec.ts`) is a skeleton — needs fleshing out.
- **ENHANCEMENT / schema**: Consider new node components for database, security, and observability categories to improve visual distinction.

## Fixed Issues

### 2026-03-18 — Editor-Engine Contract Enforcement
- **CRITICAL / drift**: Editor had hardcoded COERCION_RULES (63 lines) that could drift from engine — FIXED: now reads from generated engine-schemas.json
- **CRITICAL / serialization**: Editor wrote `ui_position` into YAML output, modifying configs on open — FIXED: stripped from serialization, layout stored in `.workflow-editor.json` sidecar
- **HIGH / drift**: `mergeSchemas()` preserved static ioSignature over engine schemas — FIXED: engine schemas now take priority
- **HIGH / connections**: Connection rules were static in editor, not derived from engine — FIXED: coercion rules + IO signatures loaded from engine export
- **MEDIUM / ide**: Both IDE plugin sync workflows were manually disabled since March 13 — FIXED: re-enabled, both synced to v0.3.4800

### 2026-03-18 — Iteration 1: Round-Trip Fidelity QA
- **QA scenario**: Round-trip fidelity on 3 real configs (api-server, event-driven, data-pipeline)
- **Result**: 27/27 tests pass — all modules, configs, dependsOn, workflows, routes, subscriptions preserved
- **Contract tests**: 18/18 pass, engine schemas in sync (272 module types, 48 coercion rules)
- **Drift check**: No drift detected between engine and editor schemas
- **New test added**: `src/utils/serialization-realworld.test.ts` (27 tests on real configs)

### 2026-03-18 — Iteration 2: Connection Rule Accuracy Audit
- **QA scenario**: Connection accuracy — edge auto-detection, type compatibility, maxIncoming enforcement
- **Result**: 118/118 tests pass — all 93 engine coercion rules verified in editor
- **Edge detection**: `isPipelineFlowConnection` correctly classifies step↔step, api.query/command→step as pipeline-flow
- **No divergence**: Editor loads coercion rules directly from engine export, cannot drift
- **One design note**: `api.gateway`/`api.handler` are NOT pipeline-flow sources (only `api.query`/`api.command`). Not a bug, but worth tracking if those types ever route to step chains.
- **Total tests**: 340 across 20 test files (up from 195 at session start)

### 2026-03-18 — Iteration 10: Pass-Through Fields + Drift Check
- **Fix**: `parseYaml()` now reads `imports`, `requires`, `platform`, `infrastructure`, `sidecars`
- **Fix**: `nodesToConfig()` passes through all 6 non-visual sections (pipelines, imports, requires, platform, infrastructure, sidecars) from originalConfig
- **Drift check**: Live engine 272 types / 48 rules matches committed schemas exactly — no drift
- **Tests**: 33 edge case tests (was 31 — added infrastructure + sidecars)
- **Total tests**: 481 across 22 files

### 2026-03-18 — Iteration 9: Serialization Edge Cases
- **QA**: 31 edge case tests covering pass-through fields, step.conditional, module ordering, complex config values, empty configs, YAML comments, special character names
- **No bugs found**: All edge cases handled correctly
- **Key findings**: `imports`/`requires`/`platform` are intentionally not surfaced by parseYaml() (only modules/workflows/triggers/pipelines). YAML comments stripped by js-yaml (spec-correct). Module insertion order preserved. Nested objects/arrays/nulls round-trip intact.
- **Total tests**: 479 across 22 files

### 2026-03-18 — Iteration 8: Property Panel Schema Fidelity
- **QA scenario**: Scenario C — Property panel correctness for 10 module types
- **Result**: 90/90 tests pass — all configFields, types, required flags, defaults, select options match engine
- **Types audited**: http.server, http.middleware.cors, database.workflow, static.fileserver, storage.sqlite, observability.otel, actor.pool, auth.jwt, database.partitioned, http.middleware.ratelimit
- **Field types covered**: string, number, boolean, select, array, json, duration, map
- **Finding**: `duration` type passes through raw from engine JSON. `moduleSchemaStore.mapFieldType()` converts `duration→string` only for server-fetched schemas. Not a functional issue — editor renders duration fields as text inputs either way.
- **Total tests**: 448 across 21 test files

### 2026-03-18 — Iteration 7: Pipeline Pass-Through Fix
- **Fix**: `nodesToConfig()` now accepts optional `originalConfig` parameter and passes through the `pipelines` section
- **Before**: Top-level `pipelines:` section was read by `parseYaml()` but lost during `nodesToConfig()` serialization
- **After**: Pipelines survive round-trip when caller provides the original config (e.g., `nodesToConfig(nodes, edges, moduleTypeMap, parsed)`)
- **Test**: Real-world tests verify pipeline names preserved for webhook-pipeline.yaml and test-route-pipeline.yaml

### 2026-03-18 — Iteration 6: Pipeline Round-Trip + Phantom Cleanup
- **Fix**: Removed `database.modular` phantom type from static MODULE_TYPES
- **Fix**: Added webhook-pipeline.yaml + test-route-pipeline.yaml to real-world tests (358 tests total)
- **Discovery**: Top-level `pipelines:` section is lost during round-trip — `parseYaml()` reads it but `nodesToConfig()` doesn't write it back. Logged as MEDIUM.
- **Downgraded**: JetBrains `aiResponse` to LOW — platform limitation (no public AI API), clipboard is correct behavior.

### 2026-03-18 — Iteration 5: JetBrains Cursor Sync
- **Fix**: Added `CaretListener` to `WorkflowBridge` that forwards caret position changes to webview via `window.onCursorMoved(line, col)`
- **Before**: No cursor-to-node sync in JetBrains split panel
- **After**: Cursor position in YAML text editor syncs to webview for node highlighting, matching VS Code behavior
- **Cleanup**: Listener removed in `dispose()` to prevent leaks

### 2026-03-18 — Iteration 4: JetBrains Ready Handshake
- **Fix**: Added `readyQuery` JBCefJSQuery + `hostBridge.sendReady()` to JetBrains WorkflowBridge
- **Before**: `onLoadEnd` immediately fired `sendYamlToEditor()` + schemas — race condition if webview JS not ready
- **After**: `onLoadEnd` only injects bridge; defers YAML/schemas until webview calls `sendReady()`
- **Matches**: VS Code's `ready` message pattern in `setupMessageHandling()`

### 2026-03-18 — Iteration 3: IDE Parity + Node Palette Completeness
- **QA scenarios**: Scenario D (node palette) + Scenario E (IDE parity)
- **IDE parity**: 3 gaps in JetBrains — missing `cursorMoved`, `aiResponse`, `ready` handshake. VS Code has no gaps.
- **Node palette**: 78 static MODULE_TYPES vs 272 engine types. 4 editor-only types (3 conditional.* UI constructs intentional, 1 database.modular stale). 198 engine-only types correctly loaded at runtime.
- **nodeComponentType() coverage**: step.* types 100% covered via prefix rule. http category 55% (api.command/query/gateway + reverseproxy + static.fileserver fall through). database/infrastructure/platform 0% specialized.
- **Key finding**: `api.command`/`api.query` are pipeline-flow chain sources in serialization but render as generic InfrastructureNode — visual mismatch.

## Learnings

- The engine's `ModuleSchemaRegistry` already has Inputs/Outputs/MaxIncoming/MaxOutgoing — the editor just wasn't using them
- `wfctl editor-schemas` exports everything the editor needs in one JSON file
- Golden file tests in the engine catch schema changes before they break the editor
- Contract tests with ajv validate round-trip output against the engine's JSON schema
- The sync-schema CI workflow is the gatekeeper — if contract tests fail, no publish, no dispatch to IDE plugins
- Top-level `pipelines:` section is separate from route-inline pipelines. The editor handles inline (steps embedded in HTTP routes) but not standalone pipeline definitions. This is a design gap, not a bug — the visual graph doesn't represent trigger-based pipelines yet.
