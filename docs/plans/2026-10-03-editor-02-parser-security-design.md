# Editor 0.2 Parser Security Design

Status: approved under the operator's standing autonomous design/release approval.
Initiative: Signal private collaboration, Task 35 released Workflow host prerequisites.
Boundary: one compatible maintenance PR to `release/0.2.x`, based on published
`v0.2.0` (`1df78d7753298b41abe64b759c0b979fcdade97b`); release `0.2.1`.
Decision: `decisions/0001-preserve-maintenance-parser-contract.md`.

## Global Design Guidance

Sources: workspace `AGENTS.md`, `docs/design-guidance.md`, `docs/PORTFOLIO.md`,
`docs/PROJECTS.md`; editor `package.json`, Vite configuration, existing workflows.

| Constraint | Response |
|---|---|
| Reuse, compatibility, real consumer proof | Keep editor exports/peers/parser semantics; repair bundled dependency, not a parallel parser. |
| Public CI credential-free, hosted | Ubuntu, Node 22, pinned actions, automatic repository token only; no IDE dispatch. |
| Privileged protected release tags | Operator verifies/adds maintenance-only tag ruleset before tagging; Actions has no administration permission. |
| Immediate committed workspace state | Record release/proof and remaining current-line follow-up in the workspace after merge. |

## Problem and Alternatives

Workflow consumes `@gocodealone/workflow-editor ^0.2.0`. Its real consumer
regression rejects neither the 10,001-merge YAML input nor the vulnerable parser:
editor 0.2.0 embeds `js-yaml 4.1.1`, independently of Workflow's fixed direct copy.
Current editor `0.85.4` also locks that version, but has a different parser error
contract. No `0.2.1` tag/package existed at preflight; `latest` was `0.85.4`.

1. Selected: rebuild a narrow `0.2.1` backport with `js-yaml ^4.3.2` and real
   packed ESM/CJS consumer tests. No consumer manifest range jump.
2. Reject: upgrade Workflow to `0.85.x`; unrelated schema/API migration, not a patch.
3. Reject: externalize YAML or test only Workflow's direct dependency; changes
   packaging and does not prove the vulnerable bundled consumer is fixed.

## Requirements

| ID | Required behavior |
|---|---|
| E1 | Exact `0.2.1` package; patched resolved YAML; unchanged exports, peers, serialization API and exception propagation. No unrelated dependency refresh. |
| E2 | Actual exported `parseYaml` and `multiConfigToTabs` accept parametric valid input and the 10,000-merge boundary; throw on malformed YAML and 10,001 merges. First demonstrate RED against old dependency. |
| E3 | Build, copy only the package manifest/dist into private generated staging, explicitly stamp the verified checkout commit as manifest `gitHead`, and `npm pack`. Before publication, assert packed version/gitHead and launch consumers against the extracted tarball's ESM and CJS utils exports. Same positive/negative assertions, no source imports or mocked parser. |
| E4 | Maintenance Build runs on PR/push `release/0.2.x`: install, types, tests, targeted new-test lint, build, pack consumer probe. Baseline unrelated lint issues classified, not silently rewritten. |
| E5 | Maintenance publisher accepts only `v0.2.*`, validates tag/package identity and exact tag commit's remote maintenance-branch ancestry, runs E4, publishes the tested tarball using automatic token and `maintenance-0.2` dist-tag, creates non-latest GitHub release. No notifications or named secrets. |
| E6 | Before tagging, active creation/update/deletion protection for `v0.2.*` with only trusted organization/repository-admin bypass, plus PR/non-fast-forward/deletion protection of `release/0.2.x`; verify operator identity and exact merged HEAD. Never move/delete tags or replace current latest. |
| E7 | Green exact-head PR checks, independent bounded code review, merge, release, verify published tarball integrity/gitHead/version and real consumer proof, post-merge retro, workspace checkpoint. |

## Assumptions

| ID | Claim under attack | Failure response |
|---|---|---|
| A1 | Patched upstream default merge budget is compatible | Actual boundary/source/bundle tests; hold release on contract drift. |
| A2 | Repository token can publish its own package | Verify release result; no broader secret fallback or false release claim. |
| A3 | Existing rulesets protect only default branch | Read-only API confirmed two branch rulesets, no tag rules; add narrowly scoped maintenance safeguards with privileged operator, verify before publication. |
| A4 | `0.2.1` remains free and current latest may advance | Re-read tags/package versions before tagging; if occupied, choose next free patch without mutating artifacts. Compare current-line latest before/after without restoring stale values. |

## Self-Challenge

- A lock update alone misses the embedded parser: packed consumers are mandatory.
- Old `publish.yml` publishes `latest` and dispatches with a named secret: replace
  only the maintenance branch's publisher, not the current editor's lifecycle.
- Both editor lines are vulnerable: this backport unblocks Workflow; a separate
  compatible current-line security patch follows, with its safe-parser/fallback
  contract tested. Do not call the whole editor ecosystem fixed after this PR.

### Design Review Correction D1

The npm tarball-publish path cannot reliably discover the checkout's Git commit.
Bind `gitHead` in the generated staged manifest before final packing/testing,
assert exact version/commit in the packed probe, and publish those tested bytes.
Do not discover missing provenance only after immutable publication. The
source manifest remains unmodified by generated packing. No additional PR/task.

## Security Review

Untrusted YAML merge expansion crosses a CPU/memory boundary. Use upstream parser
limits, not custom cryptography or a second parser. Tests contain no secrets.
Public Actions uses repository-scoped tokens and explicit minimal permissions;
release tag creation remains privileged outside CI. Tag/package/ancestry checks
precede publication; publish only the already-tested tarball. External peers
resolve from the owned installed test environment, not a mocked implementation.

## Infrastructure Impact

One public maintenance branch/PR, two narrowly scoped protection rulesets,
one immutable tag/GitHub package/release. GitHub-hosted Ubuntu, existing Node 22;
no AM5 runner, cloud resources, application deployment, migrations or cross-repo
dispatch. Existing default-branch rules unchanged. Old unrelated schema-sync
automation is not broadened; its current-line review is tracked separately.

## Multi-Component Validation

| Integration | Class | Proof |
|---|---|---|
| Bundled YAML and source parser | runtime-integrated | Real source RED/GREEN plus extracted ESM/CJS tarball invocation. |
| Workflow `^0.2.0` consumer | runtime-integrated | Separate Workflow source-security PR resolves released `0.2.1`, runs actual import regression and full UI suite/build. |
| Maintenance GitHub publisher | runtime-integrated | Exact merged tag event, successful run, downloaded published package identity/integrity and consumer replay. |
| Current editor line | deferred | Separate security patch immediately after maintenance boundary; preserve its nonthrowing/safe-parser contract. |
| IDE consumer dispatch | deferred | Deliberately absent for old API backport; no release notification. |

## Rollback

No tag/package overwrite or deletion. If a test or ancestry/protection check fails,
hold publication. Before release, revert the narrow patch via PR and retain safety
rules. After release, revert a consumer pin only if its risk is explicitly accepted;
prefer a forward maintenance patch, because 0.2.0 remains vulnerable. Repair a
failed package/GitHub-release publication at the same verified immutable tag only
when the artifact is not already published; otherwise use a new patch. Never move
the current-line `latest` dist-tag as rollback.
