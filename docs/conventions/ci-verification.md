# CI verification selection

`.github/workflows/ci.yml` runs workspace checks and the complete, unsharded test suite on every PR and main push. Runner selection and release/publish gates are unchanged by matrix selection.

## Runner policy

- Non-publishing Linux jobs use `avrea-ubuntu-latest-2-vcpu`, including Linux matrix legs and the minimum-Node installer check.
- Required cross-platform matrix legs retain the GitHub-hosted macOS and Windows runners.
- npm publishing uses the official GitHub-hosted `ubuntu-latest` runner for trusted publishing, for both automatic releases and manual retries. Release Please and skill synchronization stay on Avrea.

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
- A manual **Run workflow** (`workflow_dispatch`) runs both matrices without change filtering and never creates releases. Publishing is skipped unless `publish_tag` selects an existing release for retry.
- The planner writes its comparison/fallback reason and selections to the job summary.

The language-baseline matrix retains Linux and macOS. The installer matrix retains Linux, macOS, Windows, and the minimum Node runtime. Installer selection also covers the skill-patch line-ending regression.

## Retry release publishing

Use the existing CI workflow so the npm trusted-publisher workflow identity stays unchanged:

```bash
gh workflow run ci.yml --repo mrclrchtr/supi --ref main -f publish_tag=v1.2.3
```

- Replace `v1.2.3` with an existing published GitHub release tag. Do not delete or recreate the release or move its tag.
- The workflow definition must already be on `main`. Re-running an older run retains its original workflow definition and runner.
- Retry publishing uses the same publishing job, only from `main`, after actionlint, conventional-commit checks, and verification succeed. Release Please remains skipped for manual runs.
- The resolver requires a versioned, non-draft GitHub release and resolves its tag to a commit SHA, including annotated tags. Checkout is pinned to that SHA; the version comes from the tag without `v`.
- Before installing dependencies or accessing npm, the release validator checks the checkout SHA, root version, release manifest, and every public package version. Already-published package versions are skipped by the publisher.

## Required checks and maintenance

- Keep required check names `actionlint`, `conventional-commits`, and `verify` stable.
- `verify` requires successful planning, workspace checks, and tests. Each selected matrix must succeed; each unselected matrix must be skipped. Missing outputs, failures, cancellations, and unexpected skips fail verification.
- Update package selection when workspace dependencies change. The planner regression suite checks the language baseline's workspace dependency closure.
- Release/publish conditions explicitly check direct dependency success and cancellation so planned matrix skips cannot propagate past `verify` and suppress releases.
- Release PRs have no special bypass. Their package-version changes select both matrices.
- Routine Renovate minor, patch, pin, and digest updates share a group unless a later dedicated-group rule applies. Upstream skills remain separate and manually reviewed; Pi remains manually upgraded. Existing schedules and automerge policies are retained.
