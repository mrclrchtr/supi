# Plan: Unify all SuPi packages to v1.0.0

**Goal:** All production packages at 1.0.0, orphan npm versions deprecated, tags consistent.

- [x] **Task 1**: Bump all 14 workspace packages from 0.2.0 → 1.0.0
  - Files: `packages/*/package.json` (all except supi-lsp, supi-tree-sitter, supi-test-utils)
  - Verification: `jq '.version' packages/*/package.json` shows all at 1.0.0 except test-utils (0.1.0)

- [x] **Task 2**: Bump root package.json from 0.1.0 → 1.0.0
  - File: `package.json`
  - Verification: `jq '.version' package.json` shows 1.0.0

- [x] **Task 3**: Create git tags for each package at v1.0.0
  - Verification: `git tag --list '*v1.0.0'` shows all 16 tags

- [x] **Task 4**: Deprecate orphan npm versions (0.1.0 on all packages, 0.1.1 on @mrclrchtr/supi)
  - Verification: `npm view @mrclrchtr/supi versions --json` shows deprecated notice

- [x] **Task 5**: Fix GitHub release to set supi meta-package as Latest
  - Verification: `gh release list --repo mrclrchtr/supi` shows supi as Latest

- [x] **Task 6**: Push tags and verify everything is consistent
  - Verification: `git push --tags --dry-run` shows all new tags
