# CI verification selection

`.github/workflows/ci.yml` runs workspace checks and the complete, unsharded test suite on every PR and main push. Runner selection and release/publish gates are unchanged by matrix selection.

## Matrix selection

`scripts/ci-plan.mjs` selects only the language-baseline and installer matrices:

| Changes | Language baseline | Installer |
| --- | --- | --- |
| Code Intelligence, Code Runtime, Core, LSP, Tree-sitter packages | Run | Skip |
| Shared test utilities | Run | Run |
| Installer or skill-patch packages | Skip | Run |
| `scripts/language-baseline/` | Run | Skip |
| Any workspace package manifest | Run | Run |
| Other existing packages | Skip | Skip |
| Root Markdown/license, `docs/`, `assets/`, `screenshots/`, `skills/` | Skip | Skip |
| Shared configuration, other scripts, `.github/`, `.gitattributes`, unknown infrastructure or packages | Run | Run |

Rules combine across the complete change. Package rules include all files, including Markdown fixtures. Shared-input rules take precedence over package-specific selection.

- PRs compare the exact checked-out merge commit with its main-side parent, after verifying both parents against the event.
- Main pushes compare the event's `before` and `after` commits, not just the last commit.
- Deletions and both sides of renames participate in selection.
- Missing history, unexpected checkout/event data, or comparison errors run both matrices.
- A manual **Run workflow** (`workflow_dispatch`) runs both matrices without change filtering. It does not create releases or publish.
- The planner writes its comparison/fallback reason and selections to the job summary.

The language-baseline matrix retains Linux and macOS. The installer matrix retains Linux, macOS, Windows, and the minimum Node runtime. Installer selection also covers the skill-patch line-ending regression.

## Required checks and maintenance

- Keep required check names `actionlint`, `conventional-commits`, and `verify` stable.
- `verify` requires successful planning, workspace checks, and tests. Each selected matrix must succeed; each unselected matrix must be skipped. Missing outputs, failures, cancellations, and unexpected skips fail verification.
- Update package selection when workspace dependencies change. The planner regression suite checks the language baseline's workspace dependency closure.
- Release/publish conditions explicitly check direct dependency success and cancellation so planned matrix skips cannot propagate past `verify` and suppress releases.
- Release PRs have no special bypass. Their package-version changes select both matrices.
- Routine Renovate minor, patch, pin, and digest updates share a group unless a later dedicated-group rule applies. Upstream skills remain separate and manually reviewed; Pi remains manually upgraded. Existing schedules and automerge policies are retained.
