# Task 5: Update repo docs and release metadata for the restored runtime layer, then run full stack verification

## Goal
Finish the refactor by updating repo-level maintainer/docs metadata for the restored `supi-code-runtime` layer and proving the four-package stack stages, types, lints, and tests cleanly.

## Files
Modify:
- `docs/package-layout.md`
- `release-please-config.json`

Also verify the package-level docs and manifests already touched in Tasks 1-4 remain accurate:
- `packages/supi-code-runtime/README.md`
- `packages/supi-code-runtime/CLAUDE.md`
- `packages/supi-code-runtime/package.json`
- `packages/supi-lsp/README.md`
- `packages/supi-lsp/CLAUDE.md`
- `packages/supi-lsp/package.json`
- `packages/supi-tree-sitter/README.md`
- `packages/supi-tree-sitter/CLAUDE.md`
- `packages/supi-tree-sitter/package.json`
- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`
- `packages/supi-code-intelligence/package.json`

## Change
- Add `supi-code-runtime` back to the package-layout matrix with its intended library-only shape.
- Add `packages/supi-code-runtime/package.json` to `release-please-config.json` `extra-files`.
- Do **not** edit `.release-please-manifest.json` manually.
- Confirm the package-level READMEs and CLAUDE notes describe the new layering consistently.
- Run the full stack verification for the four relevant packages and packaging flow.

## Test exemption
This task is **test-exempt** because it is repo metadata / documentation / packaging verification work, not new runtime logic.

### Rationale
The meaningful checks here are staging, typecheck, lint, and documentation consistency rather than new red-green unit behavior.

### Concrete manual verification
Before editing, confirm the current repo metadata is incomplete for the restored package:
- `rg -n "supi-code-runtime" docs/package-layout.md release-please-config.json`

After editing, run:
- `RTK_DISABLED=1 pnpm exec biome check packages/supi-code-runtime packages/supi-lsp packages/supi-tree-sitter packages/supi-code-intelligence docs/package-layout.md release-please-config.json -v`
- `RTK_DISABLED=1 pnpm vitest run packages/supi-code-runtime/ packages/supi-lsp/ packages/supi-tree-sitter/ packages/supi-code-intelligence/ -v`
- `RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-runtime/tsconfig.json packages/supi-code-runtime/__tests__/tsconfig.json packages/supi-lsp/tsconfig.json packages/supi-lsp/__tests__/tsconfig.json packages/supi-tree-sitter/tsconfig.json packages/supi-tree-sitter/__tests__/tsconfig.json packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json -v`
- `rg -n "@mrclrchtr/supi-code-intelligence/api" packages/supi-lsp packages/supi-tree-sitter`
- `RTK_DISABLED=1 pnpm pack:check -v`

Expected result:
- the initial `rg` shows the repo-level metadata gap before the edit
- all verification commands pass after the edit
- the final `rg` returns no source-code imports from substrate packages into `@mrclrchtr/supi-code-intelligence/api`
- `pnpm pack:check` stages the reintroduced package and its dependents without `workspace:` leakage or tarball path issues.
