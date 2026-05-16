# Archive

## Verification Results

1. **release-please-config.json** restructured to single-root config:
   - Sole package path: `.` (root) with `release-type: node`
   - `include-component-in-tag: false` → will produce `vX.Y.Z` tags
   - `changelog-path: CHANGELOG.md` → single root-level changelog
   - `extra-files` lists all 16 `packages/*/package.json` files so release-please bumps every package version in lockstep
   - `pull-request-title-pattern: "chore: release ${version}"` → clean PR titles without component name
   - Validated with `jq . release-please-config.json`

2. **.release-please-manifest.json** collapsed to single entry:
   - `{".": "1.0.0"}` — aligns with the current baseline version
   - Validated with `jq . .release-please-manifest.json`

3. **Stale per-package changelogs removed**:
   - All 16 `packages/*/CHANGELOG.md` files deleted
   - `ls packages/*/CHANGELOG.md` confirms none remain
   - Release-please will now generate a single `CHANGELOG.md` at the repo root

4. **PR #34 closed**:
   - `gh pr close 34` executed with explanatory comment
   - `gh pr view 34 --json state` confirms `"state":"CLOSED"`
   - Release-please will now open a fresh unified release PR on its next run

## Expected behavior after merge

- Release-please will open **one** PR titled `chore: release 1.1.0` (or `2.0.0` if breaking changes are detected across the repo)
- That PR will bump the root `package.json` version and sync the same version to **all** `packages/*/package.json` files via `extra-files`
- Merging the PR will create **one** git tag `v1.1.0` and **one** GitHub release
- A single root `CHANGELOG.md` will be generated aggregating all conventional commits
