# Workflow Editor Self-Improving Iteration Loop

> Use with: `/loop 20m` or paste as a prompt. This is the self-improving build/test/QA/audit cycle for the visual editor and its IDE plugin consumers.

## Workflow Editor Self-Improving Iteration Loop

You are running a learn → fix → build → test → QA → learn cycle for the workflow visual editor ecosystem: the core library (`workflow-editor`), VS Code extension (`workflow-vscode`), and JetBrains plugin (`workflow-jetbrains`).
When you finish early, IMMEDIATELY start the next iteration — do NOT wait for the cron timer.

### Step 1: Read the iteration log
Read /Users/jon/workspace/workflow-editor/docs/iteration-log.md FIRST. Contains known issues, build checklist, and learnings. If it doesn't exist, create it with a `# Iteration Log` header.

### Step 2: Check for active agent teams
Run TaskList. If there's an active team with pending tasks, monitor it instead of starting new work.

### Step 3a: Pick work — prioritize from multiple sources
Check ALL of these for pending work (in priority order):
a. Iteration log "Known Issues" — pick top unfixed CRITICAL/HIGH/MEDIUM
b. Design docs at /Users/jon/workspace/workflow-editor/docs/plans/ — any planned but unstarted work
c. GitHub issues: `gh issue list -R GoCodeAlone/workflow-editor`, `gh issue list -R GoCodeAlone/workflow-vscode`, `gh issue list -R GoCodeAlone/workflow-jetbrains`
d. Engine drift detection (Step 7b below)
e. Serialization round-trip gaps (new module types without contract test coverage)
f. Node type completeness (engine has module types the editor can't render properly)
g. Edge/connection rule accuracy (does the editor allow connections the engine rejects, or vice versa?)
h. IDE plugin parity (does one plugin support something the other doesn't?)
i. E2E test coverage (e2e/editor.spec.ts is a skeleton — flesh it out)

### Step 3b: Fix it
- Read the relevant source code
- Write a test if one doesn't exist (vitest for editor, tsc for vscode, gradle for jetbrains)
- Implement the fix
- Verify tests pass (see Step 4)
- Commit with descriptive message (specific files, NEVER git add -A)

### Step 4: FULL BUILD + TEST (mandatory — never skip)
```bash
# Core editor library
cd /Users/jon/workspace/workflow-editor
npx vitest run
npx tsc --noEmit
npm run build

# VS Code extension
cd /Users/jon/workspace/workflow-vscode
npx tsc --noEmit
npm run build

# JetBrains plugin
cd /Users/jon/workspace/workflow-jetbrains
./gradlew buildPlugin
```

All three must succeed before proceeding to QA.

### Step 5: Contract validation
```bash
# Regenerate engine schemas from latest wfctl
cd /Users/jon/workspace/workflow
go build -o wfctl ./cmd/wfctl
./wfctl editor-schemas --output /Users/jon/workspace/workflow-editor/src/generated/engine-schemas.json
./wfctl schema --output /Users/jon/workspace/workflow-editor/schemas/workflow-config.schema.json

# Run contract tests specifically
cd /Users/jon/workspace/workflow-editor
npx vitest run src/utils/serialization.contract.test.ts
npx vitest run src/generated/load-schemas.test.ts
```

If contract tests fail, the engine schema has drifted — fix before proceeding.

### Step 6: Interactive QA
Pick one of these QA scenarios and verify manually via the test suite or by inspection:

**Scenario A — Round-trip fidelity:** Take a real YAML config from /Users/jon/workspace/workflow/example/ (pick a different one each iteration). Parse → graph → serialize → compare. The output should be valid per the engine schema with zero editor metadata.

**Scenario B — Connection accuracy:** For 3 random module types from the engine schema, verify: (1) the editor creates the correct edge type when they connect, (2) the editor prevents connections the engine wouldn't allow, (3) maxIncoming/maxOutgoing limits are enforced.

**Scenario C — Property panel correctness:** For 3 random module types, verify: (1) all configFields from the engine schema appear in the PropertyPanel, (2) required fields show validation errors when empty, (3) default values match engine defaults.

**Scenario D — Node palette completeness:** Compare the set of module types in the NodePalette against the engine's full ModuleSchemaRegistry output. Flag any missing types. Flag any editor-only types that don't exist in the engine.

**Scenario E — IDE parity:** Compare the webview message protocol in workflow-vscode vs workflow-jetbrains. Verify both handle: yamlChanged, layoutLoaded, layoutChanged, schemasLoaded, pluginSchemasLoaded. Flag protocol gaps.

### Step 7: Update iteration log
Append results to /Users/jon/workspace/workflow-editor/docs/iteration-log.md. Mark fixed items, add new bugs. Commit.

### Step 7b: Critical Analysis & Learning
After QA, systematically evaluate beyond "did it crash." This is where real quality gaps surface.

**Serialization Audit:**
- Does the editor drop any YAML fields during round-trip (pipelines, triggers, imports, platform, sidecars)?
- Does indentation/formatting survive round-trip, or does the editor reformat?
- Are pipeline steps preserved in order?
- Does `step.conditional` with routes serialize correctly (field, routes map, default)?
- Do `dependsOn` relationships survive round-trip?
- Does `workflows` section (http routes, middleware, statemachine states) serialize correctly?
- Are module `config` maps preserved exactly (no added/removed keys)?
- If a YAML file has comments, are they preserved or stripped?

**Connection Rule Accuracy:**
- Does `http.server` → `http.router` create an `http-route` edge (not `dependency`)?
- Does `step.X` → `step.Y` create a `pipeline-flow` edge?
- Does `http.middleware.*` → `http.router` create a `middleware-chain` edge?
- Are `maxIncoming: 0` types (like http.server) prevented from receiving incoming edges?
- Can conditional nodes fan out to multiple targets with labeled routes?
- Do coercion rules from the engine match what the editor allows? Test 5 random type pairs.

**Schema Fidelity:**
- For 5 random module types: do the editor's configFields exactly match the engine's?
- Are field types correct (string vs select vs boolean vs json vs array vs map)?
- Do select fields have the right options?
- Are sensitive fields rendered as password inputs?
- Do InheritFrom fields work (config value inherited from connected node)?

**Engine-Editor Drift Detection:**
- Run `wfctl editor-schemas` and compare key counts against `src/generated/engine-schemas.json`. Any new types?
- Run `wfctl schema` and diff against `schemas/workflow-config.schema.json`. Any schema changes?
- Check if any engine step types added since last sync are missing from the editor.
- Check if static MODULE_TYPES in `src/types/workflow.ts` has types NOT in the engine (stale entries).

**IDE Plugin Audit:**
- Does the sidecar file get created when moving nodes?
- Does the sidecar file get loaded on re-open?
- Does the YAML file remain unmodified when only moving nodes (no ui_position)?
- Do plugin schemas get discovered and loaded (go.mod parse → manifest fetch)?
- Does cursor-to-node highlighting work (VS Code ViewColumn.Beside)?
- Does the webview reload when the YAML file changes externally?

**Completeness Check:**
- Which engine module types have no custom node component (fall through to InfrastructureNode)?
- Which edge types are defined but never created by auto-detection logic?
- Are there module categories with no representation in the NodePalette?
- Does the Toolbar have all expected actions (undo, redo, auto-layout, zoom, export)?
- Is the editor accessible (keyboard nav, screen reader, contrast)?

**Gap Discovery — What Would a User Expect?**
- Can I undo/redo graph changes?
- Can I copy-paste nodes?
- Can I multi-select and move a group of nodes?
- Can I search/filter the node palette?
- Can I see validation errors inline on nodes?
- Can I zoom to fit the entire graph?
- Can I export the graph as an image?
- Does the editor show a diff when the YAML changes externally?
- Can I drag a connection from one node to another and have it auto-detect the edge type?
- Does the property panel update live as I type (no save button needed)?
- Can I add pipeline steps by connecting step nodes in sequence?
- Does the editor handle very large configs (50+ modules) without lag?

Write ALL discoveries as new entries in the iteration log with:
- **Severity**: CRITICAL / HIGH / MEDIUM / LOW / ENHANCEMENT
- **Category**: serialization / connections / schema / drift / ide / completeness / gap
- **Description**: what's wrong or missing
- **Expected behavior**: what a user would expect
- **Affected repos**: workflow-editor / workflow-vscode / workflow-jetbrains

### Step 8: Assess and RESTART
- If the fix worked → progress. Move to next issue.
- If same bug 3 iterations → try fundamentally different approach.
- If all CRITICAL+HIGH fixed → work on MEDIUM issues, then completeness/gap items.
- **IMMEDIATELY start the next iteration — do NOT wait for cron timer.**
- If you have idle time and no bugs to fix, pick up: E2E tests, IDE parity, node type coverage, serialization edge cases, performance profiling.

### Constraints
- Fix 1 issue per iteration, rebuild, test. Don't fix everything at once.
- Full build ALL THREE repos before declaring success.
- Run contract tests every iteration — they are the drift detector.
- Use Sonnet for implementation agents, not Haiku.
- NEVER use git add -A.
- When spawning agents that work in git repos, use `isolation: "worktree"` so each agent operates in its own git worktree.
