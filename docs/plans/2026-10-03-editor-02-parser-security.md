# Editor 0.2 Parser Security Implementation Plan

> **For the implementing agent:** REQUIRED SUB-SKILL: Use autodev:executing-plans to implement this plan task-by-task.

**Goal:** Repair the real bundled YAML consumer without an API migration or latest-release overwrite.
**Architecture:** Patched bundled dependency, source/packed consumers, commit-bound staged tarball, maintenance-only privileged publication.
**Tech Stack:** Node 22/npm 10, existing Vitest/Vite/TypeScript, hosted Ubuntu, automatic repository token.
**Base branch:** `release/0.2.x`, published `v0.2.0` (`1df78d7753298b41abe64b759c0b979fcdade97b`).
**Design:** `docs/plans/2026-10-03-editor-02-parser-security-design.md`.
**Decision:** `decisions/0001-preserve-maintenance-parser-contract.md`.

## Scope Manifest

**PR Count:** 1
**Tasks:** 3
**Estimated Lines of Change:** ~600

**Out of scope:**
- Current editor 0.85.x API migration/release; separate compatible security follow-up next.
- Changing exports, peers, bundling, serialization implementation or unrelated npm families.
- IDE notifications, named CI secrets, self-hosted runners, application deployments, Workflow source/authority edits.
- Moving/deleting published artifacts, restoring stale latest or weakening default-branch rules.

**PR Grouping:**

| PR # | Title | Tasks | Branch |
|------|-------|-------|--------|
| 1 | Backport bundled YAML security to editor 0.2 | Task 1, Task 2, Task 3 | fix/editor-02-yaml-security |

**Status:** Draft

### Task 1: Prove And Patch Real Source/Packed Consumers

Requirements: E1-E3. Modify `package.json`, `package-lock.json`; create
`src/utils/yamlSecurity.test.ts`, `scripts/pack-maintenance.mjs`,
`scripts/pack-maintenance.test.mjs`, `scripts/verify-yaml-security.mjs`.

1. Baseline Node 22: `npm ci`, `npm test`, `npm run build`; expected existing
   69 tests PASS and built parser chunks match installed published 0.2.0.
2. Add real utils-export tests for `parseYaml` and `multiConfigToTabs`: two
   parametric resources, valid representation, malformed syntax throws,
   10,000 empty-map merges accepted/10,001 rejected.
   `npx vitest run src/utils/yamlSecurity.test.ts`: old dependency must FAIL
   on missing budget rejection, not imports. Build/pack old version and run
   real extracted ESM/CJS probe; expect the same RED, no source fallback/mock.
3. Update only package version 0.2.1 and YAML `^4.3.2`/causal lock closure with
   npm resolver. Preserve exports, peers and Vite bundling. Stage only actual
   built dist/manifest privately; stamp actual verified checkout HEAD as
   generated `gitHead` before final real `npm pack --json`. Source manifest
   must not acquire generated metadata. Packer tests reject missing/invalid
   inputs and bind output to actual Git HEAD.
4. Probe public `/utils` exports from extracted final tarball in both formats,
   using owned installed external peers. Assert version/exact gitHead before
   positive/negative parser matrix. Reject wrong metadata. Clean owned staging/
   extraction in finally; retain only caller-requested output.
5. `npm ci`; `npm test`; `npx tsc --noEmit`; targeted new-test eslint;
   `npm run build`; `node --test scripts/pack-maintenance.test.mjs`;
   `node scripts/pack-maintenance.mjs <owned-output-directory>` then
   `node scripts/verify-yaml-security.mjs <returned-tarball> <verified-head>`.
   Expected full suite and ESM/CJS/export matrices PASS, version 0.2.1/HEAD
   exact, YAML >=4.3.2 and no vulnerable bundled duplicate. Classify unrelated
   full-lint baseline, no unrelated rewrite. Commit owning files after proof.
   Rollback: reviewed narrow revert/rebuild/reprobe, then hold vulnerable release.

### Task 2: Guard Maintenance CI And Release Authority

Requirements: E4-E6. Modify `.github/workflows/build.yml`, `publish.yml`;
create `scripts/verify-maintenance-release.mjs`,
`scripts/maintenance-workflows.test.mjs`.

1. Add real parsed-workflow tests: maintenance PR/push coverage, hosted Node 22,
   immutable action pins, explicit minimal permissions, tests/build/stamped
   pack/probe before publishing, automatic token only, maintenance dist-tag,
   non-latest GitHub release, no IDE dispatch. Old definitions must FAIL on
   missing branch/probe and unsafe publication.
2. Test actual release guard with owned temporary bare-origin/clone Git repos:
   matching tag/package/HEAD on remote maintenance branch passes; malformed/
   wrong tag, package mismatch, HEAD/tag mismatch, nonancestor reject. No
   test-only production bypass; fixtures are guard tests, not publication proof.
3. Build on maintenance branch PR/push, explicit contents/read + packages/read;
   pinned checkout/setup-node and automatic token. Publisher only `v0.2.*`,
   contents/write + packages/write, full checkout. Validate numeric patch tag,
   package equality, exact peeled tag commit = HEAD, and fetched remote
   `release/0.2.x` ancestry before pack/publication. Run types/tests/build,
   staged commit-bound pack and extracted probe; `npm publish <tested-tgz>
   --tag maintenance-0.2`; `gh release create <tag> <tested-tgz> --verify-tag
   --latest=false`. No named secret, default-latest publish or notifications.
4. `node --test scripts/maintenance-workflows.test.mjs`, actionlint if available:
   all real guard/graph assertions PASS. Actual pack/probe at HEAD PASS;
   mismatched packed identity rejects. Commit only owning workflow/guard files.
5. Re-read operator membership/rules. Two existing Default rulesets apply only
   to default branch; operator intel352 active org admin confirmed. Add/verify
   active narrowly scoped maintenance branch PR/non-fast-forward/deletion
   protection and `v0.2.*` creation/update/deletion protection with only trusted
   admin bypass. Pin required Build context after observing its actual name.
   Default rules unchanged; never bypass a failed check. Actions gets no admin
   token. Retain readback evidence privately plus compact retro result.
   Rollback: reviewed workflow revert/hold publication, retain safety protections.

### Task 3: Merge, Publish And Verify Immutable Maintenance Release

Requirements: E7/E3/E5/E6. Design/plan/review docs, post-merge retro and real
published consumer proof. Lead owns Git/settings/PR/release; workers no git authority.

1. Fresh Task 1/2 checks, version-skew/exports/peers/bundling audit and strict
   lock PASS. Independent spec then code-quality review; fix concrete issues.
   Push branch/create sole PR to `release/0.2.x`, request review, monitor exact
   head: complete tests/build/packed-probe hosted Build SUCCESS. No release
   before merge/green checks. Disclose any unavailable review receipt.
2. Merge under standing approval; fetch branch and verify intended merged
   commit. Recheck free package/tag 0.2.1, active protections/operator bypass,
   current latest; if occupied, next free patch with narrow documented backport,
   never mutate an artifact. Tag only verified merged HEAD; monitor publisher
   to SUCCESS, no main/master source reuse or cross-repo dispatch.
3. Download published package/GitHub tarball; verify registry integrity, version,
   gitHead and exact publisher bytes. Run downloaded ESM/CJS probe. Maintenance
   dist-tag points to patch; latest remains current-line (allow concurrent newer
   latest, never restore stale value). These are actual publication assertions,
   not guard fixture/unit results.
4. Retro ties D1/plan findings to real code/proof/CI. Commit/push curated
   workspace portfolio/project/follow-up facts before unrelated work. Continue
   separately locked Workflow consumer lock/regression proof and current-line
   compatible editor security fix. This boundary does not complete Signal or
   Task 35. Close only this lock when all tasks verified.
   Rollback: no tag/package/latest mutation; forward compatible patch and hold
   downstream promotion on failure.

## Integration Matrix

| Integration | Class | Proof |
|---|---|---|
| Source editor + bundled YAML | runtime-integrated | Task 1 actual exports RED/GREEN |
| Tarball + ESM/CJS + peers | runtime-integrated | Task 1 extracted consumer + commit metadata |
| Git/protected branch + publisher | runtime-integrated | Tasks 2/3 real guard Git and actual tag/package |
| Workflow UI consumer | runtime-integrated | Task 3 continuation in independent source plan |
| Current editor/IDE dispatch | deferred | Separate current-line patch; old-line dispatch absent |

## Ownership And Order

Worker: Task 1 package/lock/source tests/packer/probe. Lead: Task 2 workflows/
guard/settings. Disjoint writes; no concurrent source mutation during package
snapshots. Task 3 follows both; source Workflow cold Linux test runs separately.
No further operator approval needed; standing approval recorded in design.
