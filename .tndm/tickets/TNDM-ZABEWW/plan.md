# Plan: Fix SuPi publish pipeline manifests for npm-compatible Pi packages

## File map

- `scripts/staged-manifests.mjs` — new helper module that discovers workspace package versions, rewrites staged SuPi package manifests with pnpm-compatible exportable manifests, strips publish-irrelevant `devDependencies`, and walks staged bundled workspace package copies.
- `scripts/pack-staged.mjs` — call the staged manifest rewrite immediately after `cp -RL` and before `npm pack` / `npm pack --dry-run`.
- `scripts/verify-tarball.mjs` — expand tarball verification to reject `workspace:` protocol in every packed `package.json`, including bundled sub-package manifests.
- `scripts/__tests__/pack-staged.test.mjs` — integration tests proving staged tarballs have clean root and bundled workspace manifests.
- `scripts/__tests__/verify-tarball.test.mjs` — focused tests for the tarball verifier’s clean-manifest and failure behavior.
- `package.json` — add the pnpm manifest helper dev dependency if using `@pnpm/exportable-manifest`; keep existing `pack:check`, `pack:verify`, and `verify` command surfaces unchanged.
- `pnpm-lock.yaml` — updated by `pnpm install` if a dev dependency is added.
- `CLAUDE.md` — update maintainer packaging guidance to document staged manifest export and tarball manifest verification.

## Tasks

- [x] **Task 1**: Add failing integration tests for clean staged package manifests
  - Files: `scripts/__tests__/pack-staged.test.mjs`
  - Change: Add tests that call `packStaged()` for `packages/supi-lsp` and `packages/supi`, extract packed `package.json` files with `tar -xOf`, and assert:
    - root manifests contain no `workspace:` strings
    - bundled workspace package manifests such as `package/node_modules/@mrclrchtr/supi-lsp/package.json` and `package/node_modules/@mrclrchtr/supi-code-intelligence/package.json` contain no `workspace:` strings
    - publish manifests do not contain `devDependencies`
    - `bundledDependencies` arrays remain present where they existed
  - Verification: `RTK_DISABLED=1 pnpm vitest -v run scripts/__tests__/pack-staged.test.mjs`
  - Expected RED result before implementation: assertions fail because current `packStaged()` preserves `workspace:*` and `devDependencies` in packed manifests.

- [x] **Task 2**: Add failing verifier tests for `workspace:` leakage in tarballs
  - Files: `scripts/__tests__/verify-tarball.test.mjs`, `scripts/verify-tarball.mjs`
  - Change: Add tests that create small temporary `.tgz` files with `tar -czf`:
    - one clean tarball with `package/package.json`
    - one dirty tarball with `package/package.json` containing a dependency like `"workspace:*"`
    - optionally one dirty nested manifest at `package/node_modules/@scope/pkg/package.json`
    Assert `verifyTarball()` passes the clean tarball and throws a message naming the dirty manifest path for dirty tarballs.
  - Verification: `RTK_DISABLED=1 pnpm vitest -v run scripts/__tests__/verify-tarball.test.mjs`
  - Expected RED result before implementation: dirty tarball assertions fail because `verifyTarball()` currently checks extraction and `..` paths only.

- [x] **Task 3**: Add the staged manifest rewrite helper
  - Files: `scripts/staged-manifests.mjs`, `package.json`, `pnpm-lock.yaml`
  - Change: Implement and export a helper such as `rewriteStagedManifests(stageDir, workspaceRoot)` that:
    - discovers workspace package source directories from `pnpm-workspace.yaml` package globs, limited to local packages with `package.json`
    - builds a map of workspace package name → source directory/version
    - walks staged `package.json` files whose `name` belongs to that workspace map, including bundled copies under `node_modules/@mrclrchtr/*`
    - uses pnpm-compatible manifest export logic, preferably `@pnpm/exportable-manifest`’s `createExportableManifest(stagePackageDir, manifest, { catalogs: {} })`, so `workspace:*`, `workspace:^`, and `workspace:~` follow pnpm publish semantics
    - removes `devDependencies` from the staged publish manifest after export so private workspace-only test utilities do not leak
    - preserves `bundledDependencies` / `bundleDependencies`
  - Verification: `pnpm install` if `package.json` changes, then `RTK_DISABLED=1 pnpm vitest -v run scripts/__tests__/pack-staged.test.mjs`
  - Expected GREEN result for Task 1 after wiring in Task 4; this helper may be unit-tested indirectly until `pack-staged.mjs` calls it.

- [x] **Task 4**: Wire staged manifest rewriting into `packStaged()`
  - Files: `scripts/pack-staged.mjs`
  - Change: After `cp -RL` and before both dry-run and real `npm pack`, call the new helper with the staged package directory and repository root. Keep CLI behavior and return values unchanged.
  - Verification: `RTK_DISABLED=1 pnpm vitest -v run scripts/__tests__/pack-staged.test.mjs`
  - Expected GREEN result: `packages/supi-lsp` and `packages/supi` staged tarballs have npm-compatible root and bundled workspace manifests, with no staged `devDependencies`.

- [x] **Task 5**: Expand tarball verification to reject dirty package manifests
  - Files: `scripts/verify-tarball.mjs`
  - Change: After listing tarball entries and before/after extraction, inspect every entry ending in `/package.json` using `tar -xOf`. Fail if any manifest content contains `workspace:`. Include offending tarball paths and matching lines/snippets in the error message. Keep existing `..` entry rejection and extraction check.
  - Verification: `RTK_DISABLED=1 pnpm vitest -v run scripts/__tests__/verify-tarball.test.mjs`
  - Expected GREEN result: clean fixture passes; root and nested dirty manifest fixtures fail with clear paths.

- [x] **Task 6**: Run targeted real packaging checks
  - Files: `scripts/pack-staged.mjs`, `scripts/verify-tarball.mjs`, `scripts/staged-manifests.mjs`
  - Change: No new code unless failures reveal gaps. Pack and verify representative packages with bundled deps.
  - Verification:
    - `node scripts/publish.mjs packages/supi-lsp`
    - `node scripts/publish.mjs packages/supi`
    - Extract both reported tarballs or use `tar -xOf` spot checks to confirm no `workspace:` in `package/package.json` or bundled `package/node_modules/@mrclrchtr/*/package.json`.
  - Test exemption rationale: this is an integration/manual verification task for npm tarball behavior across actual package contents; the assertions are partly covered by Tasks 1–5.

- [x] **Task 7**: Update maintainer packaging documentation
  - Files: `CLAUDE.md`
  - Change: Replace the existing packaging note that only mentions `cp -RL` + `verify-tarball.mjs` with the full maintained pipeline: dereference staging, export npm-compatible manifests, strip staged dev deps, `npm pack`, reject `../` paths, and reject `workspace:` in all packed package manifests. Keep the Pi-docs rationale for bundled internal Pi packages.
  - Verification: `pnpm exec biome check CLAUDE.md`
  - Test exemption rationale: docs-only change; Biome validates formatting.

- [x] **Task 8**: Run full packaging and focused quality gates
  - Files: all changed files
  - Change: Fix any issues surfaced by the verification commands without broad unrelated refactors.
  - Verification:
    - `RTK_DISABLED=1 pnpm vitest -v run scripts/__tests__/pack-staged.test.mjs scripts/__tests__/verify-tarball.test.mjs`
    - `pnpm exec biome check scripts package.json CLAUDE.md`
    - `pnpm pack:check`
    - `pnpm pack:verify`
  - Expected result: all commands pass, and `pack:verify` now fails if any published tarball would contain `workspace:` in a packed manifest.

## Self-review

- Coverage: The plan addresses Pi’s requirement to bundle internal Pi packages, npm compatibility for Pi installs, root and nested manifest cleanup, staged dev dependency stripping, and tarball verification.
- Placeholder scan: No placeholders remain.
- Consistency: The plan keeps the existing public script surfaces and adds one focused helper module plus tests.
- Right-sized detail: Tasks are executable without prescribing unnecessary implementation minutiae beyond the required manifest semantics.