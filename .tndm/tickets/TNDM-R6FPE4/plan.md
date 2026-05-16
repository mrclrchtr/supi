## Unified monorepo versioning for SuPi

Switch release-please from independent per-package versioning (`node-workspace`) to a single root-driven release that bumps all `packages/*/package.json` versions in lockstep, producing one tag (`vX.Y.Z`) and one changelog.

- [x] **Task 1**: Replace `release-please-config.json` with single-root config
  - Remove `node-workspace` plugin and all per-package entries
  - Add `.` (root) as sole `release-type: node` package
  - Set `include-component-in-tag: false` for `vX.Y.Z` tags
  - Set `changelog-path: CHANGELOG.md` (root-level)
  - Add every `packages/*/package.json` to `extra-files` so release-please syncs their `version` field
  - Set `pull-request-title-pattern: "chore: release ${version}"`
  - File: `release-please-config.json`
  - Verification: `jq . release-please-config.json`

- [x] **Task 2**: Replace `.release-please-manifest.json` with single entry
  - Collapse all 16 per-package entries into one `".": "1.0.0"`
  - File: `.release-please-manifest.json`
  - Verification: `jq . .release-please-manifest.json`

- [x] **Task 3**: Remove stale per-package changelogs
  - Delete all `packages/*/CHANGELOG.md` (16 files)
  - These will no longer be updated by release-please; a single root `CHANGELOG.md` will be generated instead
  - Verification: `find packages -name CHANGELOG.md` returns empty

- [x] **Task 4**: Close the obsolete release PR #34
  - The old per-package release PR becomes invalid after config changes
  - Release-please will open a fresh unified PR on the next run
  - Verification: `gh pr view 34 --json state` shows `CLOSED`
