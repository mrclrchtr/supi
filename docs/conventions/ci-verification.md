# CI and release gates

## Verification policy

| Event | Checks | Release effects |
| --- | --- | --- |
| Ordinary PR | Actionlint, Conventional Commits, Biome, TypeScript, skills, WASM/config consistency, focused CI/release regression tests | None |
| Trusted version-only release PR | Actionlint, Conventional Commits, release/config consistency | None |
| Ordinary main push | Read-only release-candidate discovery | Release Please updates its PR independently |
| Merged release PR on main | Complete workspace checks, unsharded test suite, staged tarball verification, both full cross-platform matrices | Tag/release creation, then npm publishing, only after verification succeeds |
| Manual CI run without inputs | Same exhaustive verification at the selected event commit | None |
| Manual `release_pr` retry | Same exhaustive verification at that PR's merge commit | Recover tag/release creation and publishing |
| Manual `publish_tag` retry | Same exhaustive verification at the existing release tag's commit | Retry npm publishing only |

The complete test suite, tarball verification, and cross-platform matrices are release gates, not main-branch admission checks. `main` may contain failures that only exhaustive verification detects. Run manual full verification when early cross-platform feedback is needed.

## Workflow ownership

- `.github/workflows/ci.yml` owns checks, release-candidate verification, tag/release creation, and npm publishing.
- `.github/workflows/release-please.yml` maintains release PRs on main pushes or manual dispatch. It installs no workspace dependencies and sets `skip-github-release: true`.
- `.github/workflows/skills-sync.yml` retains the independent upstream-skill regeneration flow.
- Keep npm publishing in `ci.yml`: its filename is part of the existing npm trusted-publisher identity.
- Release Please's release action cannot select an immutable candidate SHA. `scripts/create-release.mjs` creates the Git tag and GitHub release explicitly at the verified SHA, then applies `autorelease: tagged` and removes `autorelease: pending` so Release Please can maintain subsequent PRs.

## Planning and immutable checkouts

`scripts/ci-plan.mjs` emits one mode and an exact checkout SHA:

| Mode | Selection |
| --- | --- |
| `pr` | Ordinary PR or an unrecognized/non-metadata release PR |
| `metadata` | Trusted release PR with only permitted metadata changes |
| `full` | Merged release PR or manual full verification/retry |
| `none` | Ordinary main push; no duplicate PR checks |

- Release PR identity requires the `mrclrchtr-bot[bot]` app, the repository's Release Please branch, same-repository head and base, main as the base, and an `autorelease: pending` or `autorelease: tagged` label. A title or branch name alone is insufficient.
- The metadata-only path verifies the synthetic PR merge's parents against the event. Permitted changes are a regular-file changelog, the root release-manifest version, and version-only updates to the root/configured public package manifests. Unexpected content, file types, or uncertain comparisons fall back to ordinary PR checks.
- Main-push discovery paginates the commit-associated PRs, then requires a trusted merged release PR whose merge SHA equals the event SHA and whose title matches the candidate version. API errors and ambiguous/inconsistent candidate data fail planning.
- Every source check and published package uses the planner's SHA, including manual retries. A newer main commit is never substituted for a candidate or existing tag. Release/publishing tooling is checked out separately from the immutable workflow-event SHA, so retries of older candidates retain current safety policy without changing package contents.
- Manual release/publish retries must use the workflow definition on `main`; their candidate must remain an ancestor of that main checkout. Version, checkout SHA, release manifest, and every public package version are validated before dependencies/npm access.
- Exhaustive verification never uses path filtering: both language-baseline legs and every installer leg must pass.

## Release safety and concurrency

- Keep required PR check names `actionlint`, `conventional-commits`, and `verify` stable.
- `verify` requires successful planning, actionlint, Conventional Commits, and workspace checks. Full verification additionally requires successful tests and both matrices. PR modes require those heavy jobs to be intentionally skipped. Missing/unknown modes, missing results, cancellations, and unexpected skips fail verification.
- Tagging requires a successful full gate and a merged release PR. Publishing requires that gate plus successful release creation, or an explicitly selected existing tag on a manual retry. Manual verification without inputs never releases.
- Immediately before tagging, revalidate the candidate's checkout, package versions, merged PR identity, ancestry on main, and first changelog entry.
- Existing tags are never moved. Annotated tags are peeled to their commit. An existing tag at another SHA, a draft/mismatched release, or an API failure blocks release creation. Tag-only/fully-created releases can be recovered without deleting or recreating a tag/release.
- PR checks cancel superseded runs. Distinct main runs do not replace queued verification candidates. Creation serializes by version; npm publishing uses one cross-version concurrency group because packages share dist-tags. GitHub concurrency is not a durable FIFO: newer arrivals can replace pending publication jobs; retry their tag explicitly if needed. Release-PR maintenance can coalesce queued main pushes independently.
- npm resolves whether a newer stable package version exists. Stable releases with no newer version publish with `--tag latest`; older recovery and prereleases use a version-specific `release-<version>` tag and never move `latest` backwards. Registry failures other than an explicit E404 block publication. Already-published versions are skipped.

## Manual operations

Full verification without publishing:

```bash
gh workflow run ci.yml --repo mrclrchtr/supi --ref main
```

Retry a merged release candidate after checks/tagging failed, even if main has advanced:

```bash
gh workflow run ci.yml --repo mrclrchtr/supi --ref main -f release_pr=123
```

Retry publishing an existing, non-draft GitHub release:

```bash
gh workflow run ci.yml --repo mrclrchtr/supi --ref main -f publish_tag=v1.2.3
```

- Select only one retry input. Use the real release PR number/tag; do not delete/recreate releases or move tags.
- Re-running an older Actions run retains its original workflow definition. Dispatch the current workflow on main to use the new flow.
- The publisher skips package versions already on npm.

## Runner policy

- Non-publishing Linux jobs use `avrea-ubuntu-latest-2-vcpu`, including Linux matrix legs and the minimum-Node installer check.
- Language acceptance retains Linux and macOS. Installer verification retains Linux, macOS, Windows, and the minimum Node runtime, including the skill-patch line-ending regression.
- npm publishing uses the official GitHub-hosted `ubuntu-latest` runner for trusted publishing, for automatic releases and manual retries.

## Dependency maintenance

Routine Renovate minor, patch, pin, and digest updates share a group unless a later dedicated-group rule applies. Upstream skills remain separate and manually reviewed; Pi remains manually upgraded. Existing schedules and automerge policies are retained.
