---
status: ready-for-implementation
implementation_status: not-started
depends_on:
  - docs/plans/2026-04-27-editor-ide-quality-release-design.md
  - Workflow PR 500 merged
---

# Editor and IDE Quality Release Implementation Plan

> **For agents:** REQUIRED SUB-SKILLS: use `superpowers:executing-plans`, `superpowers:test-driven-development`, `superpowers:runtime-launch-validation`, `superpowers:requesting-code-review`, and `superpowers:verification-before-completion`. Use an implementer plus an antagonistic code reviewer. Do not start this implementation until the current Workflow checksum PR is merged or explicitly cleared.

**Goal:** Make editor and IDE releases independently shippable with reliable unit, E2E, exploratory, and compatibility gates.

**Design Doc:** `docs/plans/2026-04-27-editor-ide-quality-release-design.md`

## Phase 1: Stabilize Local and CI Test Baseline

**Repo:** workflow-editor

1. Add a test setup file if one does not already exist.
   - Provide a browser-compatible `localStorage` mock with `getItem`, `setItem`, `removeItem`, and `clear`.
   - Ensure Zustand persistence tests do not depend on Node version quirks.

2. Pin the supported local Node version.
   - Add `.nvmrc` or `.node-version` with the CI version, currently Node 22.
   - Document the version in README or package scripts if README exists later.

3. Add focused tests for the storage setup.
   - Prove `npm test` can reset stores without `storage.setItem is not a function`.

4. Verification:
   - `npm test`
   - `npx tsc --noEmit`
   - `npm run build`

## Phase 2: Turn Playwright Into a Required Gate

**Repo:** workflow-editor

1. Replace placeholder E2E tests in `e2e/editor.spec.ts`.
   - Load a sample Workflow config through the harness.
   - Add a node from the palette.
   - Edit node config and assert YAML changes.
   - Verify YAML pane selection round-trip.
   - Verify DSL reference pane renders and navigates.

2. Add scenarios to `e2e/test-app`.
   - `strict-contracts`
   - `iac-wfctl-files`
   - `editor-bundle`

3. Update CI.
   - Add browser install/cache if needed.
   - Run `npm run test:e2e` in `.github/workflows/build.yml`.
   - Retain Playwright report artifacts on failure.

4. Verification:
   - `npm run test:e2e`
   - CI run on PR.

## Phase 3: Add Static Analysis and Security Gates

**Repo:** workflow-editor

1. Make ESLint runnable in CI.
   - Fix or scope existing lint issues.
   - Add `npm run lint` to build workflow.

2. Add npm audit gate.
   - Start as non-blocking with uploaded output if current vulnerabilities need triage.
   - Create issues or plan entries for remaining high vulnerabilities.
   - Move to blocking at `--audit-level=high` after triage.

3. Verification:
   - `npm run lint`
   - `npm audit --audit-level=high` or documented non-blocking CI step.

## Phase 4: Editor-Only Release Workflow

**Repo:** workflow-editor

1. Add an editor release workflow.
   - Trigger: `workflow_dispatch` with version input and optional prerelease flag.
   - Trigger: tag push for editor-owned tags if preferred by repo convention.
   - Gates: install, TypeScript, unit tests, Playwright, build, publish.

2. Fix publish ordering in schema sync.
   - Commit/tag generated schema/bundle changes before publish where practical.
   - Publish exact package contents that correspond to the tag.

3. Dispatch IDE syncs with the editor package version.
   - Do not assume editor version always equals Workflow version.
   - Include Workflow compatibility metadata in payload when schema/bundle sync came from Workflow release.

4. Verification:
   - Dry-run workflow commands locally where possible.
   - Manual workflow dispatch on a test version or dry-run branch if supported.

## Phase 5: VS Code Sync and Compatibility

**Repo:** workflow-vscode

1. Update sync workflow.
   - Consume editor release payload version exactly.
   - Run compile/test/package before publishing or merging.

2. Add schema associations.
   - `app.yaml`, `app.yml`
   - `infra.yaml`, `infra.yml`
   - `wfctl.yaml`, `wfctl.yml`

3. Add extension host smoke test.
   - Open a fixture Workflow project.
   - Verify editor webview loads.
   - Verify schema diagnostics activate.

4. Verification:
   - `npm test`
   - compile/package command from repo scripts.

## Phase 6: JetBrains Sync and Compatibility

**Repo:** workflow-jetbrains

1. Resolve compatibility metadata.
   - Align README and `sinceBuild`.
   - Define supported IDE version window.

2. Update sync workflow.
   - Consume editor release payload version exactly.
   - Run Gradle tests/build.
   - Run plugin verifier for supported IDE versions.

3. Add file association and webview smoke tests.
   - `app.yaml`, `infra.yaml`, `wfctl.yaml`.
   - Editor asset load after package sync.

4. Verification:
   - `./gradlew test`
   - `./gradlew buildPlugin`
   - plugin verifier task for declared IDE versions.

## Phase 7: Exploratory Playwright CLI Runbook

**Repo:** workflow-editor

1. Add `docs/testing/exploratory-editor-playwright.md`.
   - Commands to launch harness.
   - Playwright CLI flows for canvas, YAML, strict contracts, and IaC/wfctl files.
   - Expected screenshots or assertions.

2. Add a release checklist item requiring an exploratory pass for major editor UI changes.

3. Verification:
   - Run the checklist once and record findings in `docs/iteration-log.md` or CI artifacts.

## Rollout

1. Land `workflow-editor` baseline/test/release improvements.
2. Release an editor-only patch version.
3. Let VS Code and JetBrains sync from that editor release.
4. Confirm both IDE plugin workflows pass compatibility checks.
5. Then start the strict-contract editor implementation if not already in progress.
