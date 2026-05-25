# Task 7: Update docs, release wiring, and packaging verification for the new architecture

## Goal
Document the new package/layering shape and prove the repo still builds, packs, and publishes correctly after the refactor.

## Files
- `docs/code-runtime-architecture.md`
- `docs/package-layout.md`
- `packages/supi-code-runtime/README.md`
- `packages/supi-code-runtime/CLAUDE.md`
- `packages/supi-lsp/README.md`
- `packages/supi-lsp/CLAUDE.md`
- `packages/supi-tree-sitter/README.md`
- `packages/supi-tree-sitter/CLAUDE.md`
- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`
- `release-please-config.json`
- `scripts/__tests__/pack-staged.test.mjs`

## Change
- Refresh all affected package docs so they describe the new runtime/provider layering and the current API ownership accurately.
- Update `docs/package-layout.md` to add the new `supi-code-runtime` package to the package matrix and describe its expected library-only shape.
- Make any release/packaging assertion updates needed so the staged-pack tests understand the new package and its publish manifest expectations.
- Keep the architecture note in `docs/code-runtime-architecture.md` synchronized with the final implemented layering, not just the initial spike.

## Verification
Test-exempt rationale: this phase is documentation, release wiring, and pack verification rather than new business logic; meaningful red-green tests already landed in earlier phases.

Run:
- `pnpm exec biome check docs/code-runtime-architecture.md docs/package-layout.md packages/supi-code-runtime/README.md packages/supi-code-runtime/CLAUDE.md packages/supi-lsp/README.md packages/supi-lsp/CLAUDE.md packages/supi-tree-sitter/README.md packages/supi-tree-sitter/CLAUDE.md packages/supi-code-intelligence/README.md packages/supi-code-intelligence/CLAUDE.md release-please-config.json scripts/__tests__/pack-staged.test.mjs`
- `pnpm exec vitest run scripts/__tests__/pack-staged.test.mjs`
- `pnpm pack:verify`
- `pnpm exec tsc -b packages/supi-code-runtime/tsconfig.json packages/supi-lsp/tsconfig.json packages/supi-tree-sitter/tsconfig.json packages/supi-code-intelligence/tsconfig.json packages/supi-code-runtime/__tests__/tsconfig.json packages/supi-lsp/__tests__/tsconfig.json packages/supi-tree-sitter/__tests__/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`

Expected result: docs lint cleanly, pack-staged assertions pass, and pack verification completes without workspace-protocol or tarball-layout regressions.
