# 0001. Preserve Maintenance Parser Contract

Status: Accepted
Date: 2026-10-03
Related: `docs/plans/2026-10-03-editor-02-parser-security-design.md`

## Context

Workflow's `^0.2.0` editor bundles vulnerable YAML independently of its direct
dependency. The current editor is `0.85.4` with different parser error semantics.
The historical publisher would also replace `latest` and notify unrelated IDEs.

## Decision

Backport patched upstream YAML to the exact published 0.2.0 API on `release/0.2.x`.
Prove extracted ESM/CJS consumers, publish `0.2.1` under `maintenance-0.2`, and keep
the GitHub release non-latest. Protect maintenance tags before release and use
only the automatic repository token in CI. Do not externalize YAML or migrate
Workflow to the current editor API just to repair a dependency vulnerability.

## Consequences

Workflow retains compatibility while receiving the real bundled fix. Maintenance
publication has its own guarded lifecycle and does not disturb current-line
consumers. The current editor's vulnerable lock remains a separately tracked
security patch; this release alone is not ecosystem-wide remediation.
