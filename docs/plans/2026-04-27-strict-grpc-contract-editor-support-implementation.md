---
status: ready-for-implementation
implementation_status: not-started
depends_on:
  - docs/plans/2026-04-27-strict-grpc-contract-editor-support-design.md
  - Workflow PR 500 merged
---

# Strict gRPC Contract Editor Support Implementation Plan

> **For agents:** REQUIRED SUB-SKILLS: use `superpowers:executing-plans`, `superpowers:test-driven-development`, `superpowers:subagent-driven-development`, `superpowers:requesting-code-review`, and `superpowers:verification-before-completion`. Use an implementer plus an antagonistic code reviewer. Do not start this implementation until the current Workflow checksum PR is merged or explicitly cleared.

**Goal:** Make strict gRPC go-plugin contracts first-class in `wfctl` editor exports, `workflow-editor`, and IDE integrations.

**Design Doc:** `docs/plans/2026-04-27-strict-grpc-contract-editor-support-design.md`

## Phase 1: Workflow Export Contract Bundle

**Repo:** workflow

1. Add tests for a new canonical editor bundle export.
   - Cover built-in module schemas.
   - Cover step schemas.
   - Cover strict contract descriptors.
   - Cover descriptor/message metadata.
   - Cover `app.yaml`, `infra.yaml`, and `wfctl.yaml` schemas.

2. Implement bundle types in the Workflow/wfctl schema export package.
   - Reuse existing module, step, coercion, DSL reference, and snippets producers.
   - Normalize strict contract registry data into editor-facing contract descriptors.
   - Include a bundle schema version.

3. Add `wfctl editor-bundle`.
   - Flags: `--output`, `--plugin-dir`, `--registry`, `--format json`.
   - Preserve `wfctl editor-schemas` for backwards compatibility.
   - Add `wfctl editor-schemas --bundle` only if it fits existing CLI conventions cleanly.

4. Add runtime API support if the existing Workflow HTTP management API is expected to feed browser-hosted editors.
   - Endpoint: `/api/v1/admin/editor-bundle`.
   - Keep module schema endpoint stable.

5. Verification:
   - `GOWORK=off go test ./cmd/wfctl ./...` with focused packages first.
   - `wfctl editor-bundle --output /tmp/editor-bundle.json`.
   - Validate generated JSON against a bundle schema.

## Phase 2: Editor Bundle Loading

**Repo:** workflow-editor

1. Add failing tests for bundle loading.
   - `load-schemas` reads module, step, coercion, contract, message, and schema sections.
   - Existing engine schema loading still works.
   - Plugin contract overlays do not erase built-in types unless they own the same key.

2. Add editor bundle TypeScript types.
   - `EditorContractBundle`
   - `EditorContractDescriptor`
   - `EditorMessageDescriptor`
   - `EditorYamlSchemas`

3. Extend `WorkflowEditorProps`.
   - Add `onEditorBundleRequest?: () => Promise<EditorContractBundle | null>`.
   - Keep `onSchemaRequest` and `onPluginSchemaRequest`.
   - Prefer bundle when available.

4. Extend stores.
   - Add contract/message state to `moduleSchemaStore` or a dedicated `contractSchemaStore`.
   - Keep selectors cheap for node rendering and property panel lookup.

5. Verification:
   - `npm test -- src/generated src/stores`.
   - `npm run build`.

## Phase 3: Contract UI and Validation

**Repo:** workflow-editor

1. Write tests before UI code.
   - Palette displays plugin strict mode metadata.
   - Node body displays typed contract input/output names.
   - Property panel shows Contract section for strict/proto-with-legacy/legacy modes.
   - Validation flags strict-mode config and connection violations.

2. Implement UI.
   - Palette strict indicator and plugin grouping.
   - Contract section in `PropertyPanel`.
   - Descriptor-backed nested fields for config messages where no `ConfigFieldDef` exists.
   - Connection compatibility checks that prefer strict contract message compatibility when present.

3. Add YAML validation.
   - Live validation for selected node config against bundle schemas.
   - Host callback path for authoritative `wfctl validate --json` diagnostics.

4. Verification:
   - `npm test`.
   - `npm run build`.
   - `npm run test:e2e` after adding a bundle-backed E2E fixture.

## Phase 4: `wfctl.yaml` and IaC Authoring

**Repos:** workflow, workflow-editor

1. Add or export JSON schemas for:
   - `app.yaml`
   - `infra.yaml`
   - `wfctl.yaml`

2. Add editor tests for file-type recognition.
   - `wfctl.yaml` opens as project config.
   - `infra.yaml` opens as IaC config.
   - `app.yaml` behavior is unchanged.

3. Add UI affordances.
   - Workspace/file tab metadata for app, infra, and wfctl files.
   - IaC/provider metadata panels.
   - Future destructive-change policy metadata fields without implementing deploy gating in this task.

4. Verification:
   - YAML round-trip tests for all three file types.
   - E2E fixture with `app.yaml`, `infra.yaml`, and `wfctl.yaml`.

## Phase 5: IDE Plugin Integration

**Repos:** workflow-vscode, workflow-jetbrains

1. VS Code:
   - Add YAML associations for `wfctl.yaml`, `wfctl.yml`, `infra.yaml`, and `infra.yml`.
   - Add editor bundle generation/loading.
   - Add diagnostics bridge for strict contract validation.
   - Add tests for activation and schema association.

2. JetBrains:
   - Add file recognition/schema association for `wfctl.yaml`, `wfctl.yml`, `infra.yaml`, and `infra.yml`.
   - Pass editor bundle data into webview.
   - Add compatibility verification matrix matching declared IDE support.

3. Verification:
   - VS Code extension compile/test/package.
   - JetBrains Gradle test/build/plugin verifier.
   - Manual smoke in both IDEs with a strict-contract sample project.

## Phase 6: Release Path

1. Release Workflow with `wfctl editor-bundle`.
2. Sync generated bundle into `workflow-editor`.
3. Release `workflow-editor` independently.
4. Trigger IDE plugin syncs.
5. Verify VS Code and JetBrains consume the editor release without requiring another Workflow release.

## Rollback

- Keep `engine-schemas.json` and old callbacks in place for one release train.
- If bundle loading fails, editor logs a warning and falls back to generated engine schemas.
- If IDE bundle generation fails, extensions continue to open YAML and use static schema associations.
