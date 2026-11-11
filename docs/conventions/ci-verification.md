# CI and release gates

## Verification policy

| Event | Checks | Release effects |
| --- | --- | --- |
| PR | Actionlint, Conventional Commits, Biome, TypeScript, skills, WASM consistency, focused CI/release/preparation regression tests | None |
| Ordinary main push | Release Commit detection from Git only | None |
| Release Commit pushed to main | Complete workspace checks, unsharded test suite, staged tarball verification, both full cross-platform matrices | Tag/release creation, then npm publishing, only after verification succeeds |
| Manual CI run without inputs | Same exhaustive verification at the selected event commit | None |
| Manual `release_sha` retry | Same exhaustive verification at that Release Commit | Recover tag/release creation and publishing |
| Manual `publish_tag` retry | Same exhaustive verification at the existing release tag's commit | Retry npm publishing only |

The complete test suite, tarball verification, and cross-platform matrices are release gates, not main-branch admission checks. `main` may contain failures that only exhaustive verification detects. Run manual full verification when early cross-platform feedback is needed.

## Workflow ownership

- `.github/workflows/ci.yml` owns checks, release-candidate verification, tag/release creation, and npm publishing.
- [Release preparation](release-preparation.md) creates Release Commits locally; no workflow maintains release branches or PRs.
- `.github/workflows/skills-sync.yml` retains the independent upstream-skill regeneration flow.
- Keep npm publishing in `ci.yml`: its filename is part of the existing npm trusted-publisher identity.
- `scripts/create-release.mjs` creates the Git tag and GitHub release explicitly at the verified SHA. The release body is the first `CHANGELOG.md` section at that commit.

## Planning and immutable checkouts

`scripts/ci-plan.mjs` emits one mode and an exact checkout SHA:

| Mode | Selection |
| --- | --- |
| `pr` | Any PR |
| `full` | Release Commit on main, or manual full verification/retry |
| `none` | Ordinary main push; no duplicate PR checks |

The planner also emits `release=true` when tag/release creation is authorized.

- A Release Commit has the subject `chore: release X.Y.Z`, root `package.json#version` X.Y.Z, and a first `CHANGELOG.md` section for X.Y.Z with nonempty notes ([`scripts/release-candidate.mjs`](../../scripts/release-candidate.mjs)). Trust is write access to `main`; direct pushes and merged PRs are equivalent when the Release Commit is the pushed tip with its exact subject (direct push, rebase merge, or squash merge titled exactly `chore: release X.Y.Z`).
- A pushed tip whose subject starts with `chore: release` but breaks any rule, such as a squash title `chore: release X.Y.Z (#N)`, fails planning; it never passes as an ordinary push.
- Only the newest Release Commit for a version on main may be tagged; earlier ones for the same version are superseded and fail planning and release creation.
- A version is consumed only by its tag. An existing tag at another commit fails planning; an existing tag at the candidate lets tag/release recovery finish. API errors fail planning.
- Every source check and published package uses the planner's SHA, including manual retries. A newer main commit is never substituted for a candidate or existing tag. Release/publishing tooling is checked out separately from the immutable workflow-event SHA, so retries of older candidates retain current safety policy without changing package contents.
- Public Extension Packages require shipped, structurally valid [package changelogs](package-changelogs.md). Development packing permits upcoming entries; release/tag validation and actual publication reject entries newer than the package version. No section is required for unchanged packages.
- Manual release/publish retries must use the workflow definition on `main`; their candidate must remain an ancestor of that main checkout. Version, checkout SHA, root manifest, and every public package version are validated before dependencies/npm access.
- Exhaustive verification never uses path filtering: both language-baseline legs and every installer leg must pass.

## Release safety and concurrency

- Keep required PR check names `actionlint`, `conventional-commits`, and `verify` stable.
- `verify` requires successful planning, actionlint, Conventional Commits, and workspace checks. Full verification additionally requires successful tests and both matrices. PR modes require those heavy jobs to be intentionally skipped. Missing/unknown modes, missing results, cancellations, and unexpected skips fail verification.
- Tagging requires a successful full gate and a Release Commit candidate. Publishing requires that gate plus successful release creation, or an explicitly selected existing tag on a manual retry. Manual verification without inputs never releases.
- Immediately before tagging, revalidate the candidate's checkout, package versions, Release Commit rules, ancestry on main, and first changelog entry.
- Existing tags are never moved. Annotated tags are peeled to their commit. An existing tag at another SHA, a draft/mismatched release, or an API failure blocks release creation. Tag-only/fully-created releases can be recovered without deleting or recreating a tag/release.
- PR checks cancel superseded runs. Distinct main runs do not replace queued verification candidates. Creation serializes by version; npm publishing uses one cross-version concurrency group because packages share dist-tags. GitHub concurrency is not a durable FIFO: newer arrivals can replace pending publication jobs; retry their tag explicitly if needed.
- npm resolves whether a newer stable package version exists. Stable releases with no newer version publish with `--tag latest`; older recovery and prereleases use a version-specific `release-<version>` tag and never move `latest` backwards. Registry failures other than an explicit E404 block publication. Already-published versions are skipped.

## Manual operations

Full verification without publishing:

```bash
gh workflow run ci.yml --repo mrclrchtr/supi --ref main
```

Retry a Release Commit after transient check or tagging failures, even if main has advanced:

```bash
gh workflow run ci.yml --repo mrclrchtr/supi --ref main -f release_sha=<40-char SHA>
```

For failures caused by code, fix main and re-prepare the same version instead; see [Release preparation](release-preparation.md#recovery).

Retry publishing an existing, non-draft GitHub release:

```bash
gh workflow run ci.yml --repo mrclrchtr/supi --ref main -f publish_tag=v1.2.3
```

- Select only one retry input. Use the real Release Commit SHA or tag; do not delete/recreate releases or move tags.
- Re-running an older Actions run retains its original workflow definition. Dispatch the current workflow on main to use the new flow.
- The publisher skips package versions already on npm.

## Runner policy

- All jobs use free GitHub-hosted runners (`ubuntu-latest`, `macos-latest`, `windows-latest`); the repository is public, so standard runner minutes cost nothing.
- `ci.yml` ignores `pull_request` `edited` events so body-only edits do not rerun every check. `pr-title.yml` revalidates title-only edits without dependencies.
- Language-baseline provisioning extracts only the LLVM members it needs (clangd, clang drivers, builtin and libc++ headers) and caches them by OS, architecture, and the hashes of `pins.json` and `clang-artifacts.mjs`. A completion marker prevents reusing an interrupted extraction; other servers are still provisioned fresh.
- Language acceptance retains Linux and macOS. Installer verification retains Linux, macOS, Windows, and the minimum Node runtime, including the skill-patch line-ending regression.
- npm publishing uses the official GitHub-hosted `ubuntu-latest` runner for trusted publishing, for automatic releases and manual retries.

## Dependency maintenance

- Routine Renovate minor, patch, pin, and digest updates share a group unless a later dedicated-group rule applies. Existing schedules and routine automerge remain enabled.
- npm major, minor, and patch updates must be at least 7 days old before Renovate proposes them. Strict internal checks and required release timestamps prevent missing metadata from bypassing the cooldown.
- npm-managed language-baseline packages (TypeScript, TLS, the TS6 wrapper) and pnpm are pinned only in the root `package.json` and lockfile; the frozen install enforces them. `scripts/language-baseline/pins.json` pins only toolchains and servers that npm does not manage, so Renovate npm updates cannot leave it stale.
- Security-alert PRs bypass Renovate's cooldown but require manual merge. pnpm's install-time cooldown still applies; urgent fixes need a reviewed, version-specific `minimumReleaseAgeExclude` exception rather than disabling the policy globally.
- GitHub Actions digest and digest-pin changes require manual merge: release timestamps cannot reliably age a moved tag. Upstream skills remain separate and manually reviewed; Pi remains manually upgraded.
- `pnpm-workspace.yaml` enforces the same 7-day cooldown for direct and transitive npm packages, including frozen-lockfile installs and lockfile maintenance. Resolution fails rather than accepting too-new versions or missing publication dates.
- pnpm rejects publisher-trust downgrades, verifies locked packages against the install policy, blocks exotic transitive sources, and rejects unreviewed dependency build scripts. Keep the existing explicit build allowlist; do not enable all builds.
- Save new dependencies as exact versions. Root Pi dev dependencies are pinned; published Pi peer ranges remain `*`. Release-age exceptions must identify reviewed versions, not entire packages.
