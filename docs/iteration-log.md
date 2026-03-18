# Iteration Log

## Known Issues

- **LOW / completeness**: 168 of 272 engine module types have no IO definitions (inputs/outputs). These render in the editor but can't participate in connections. Most are step types — expected behavior, but pipeline category (23 types with IO) could benefit from better node rendering.
- **ENHANCEMENT / completeness**: No pipeline configs in the 3 tested example files (api-server, event-driven, data-pipeline). Contract tests cover pipelines but real-world round-trip tests should include a pipeline-heavy config.
- **ENHANCEMENT / gap**: E2E test suite (`e2e/editor.spec.ts`) is a skeleton — needs fleshing out for browser-level validation.

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

## Learnings

- The engine's `ModuleSchemaRegistry` already has Inputs/Outputs/MaxIncoming/MaxOutgoing — the editor just wasn't using them
- `wfctl editor-schemas` exports everything the editor needs in one JSON file
- Golden file tests in the engine catch schema changes before they break the editor
- Contract tests with ajv validate round-trip output against the engine's JSON schema
- The sync-schema CI workflow is the gatekeeper — if contract tests fail, no publish, no dispatch to IDE plugins
