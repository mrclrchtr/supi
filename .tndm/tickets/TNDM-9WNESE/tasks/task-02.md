# Task 2: Migrate the Tree-sitter session registry to the shared core helper

## Goal
Replace the local Tree-sitter session-registry storage boilerplate with the new shared core helper while preserving the current public API and standalone package behavior.

## Changes
- Update `packages/supi-tree-sitter/src/session/service-registry.ts` to delegate storage to the shared `supi-core` session registry helper instead of maintaining its own `globalThis` + `Map` implementation.
- Preserve the existing public functions and semantics:
  - `setSessionTreeSitterService(cwd, service)`
  - `getSessionTreeSitterService(cwd)` returning `ready` or `unavailable`
  - `clearSessionTreeSitterService(cwd)`
- Update `packages/supi-tree-sitter/package.json` to add `@mrclrchtr/supi-core` to both `dependencies` and `bundledDependencies`, following the workspace packaging convention for runtime SuPi package dependencies.
- Update `packages/supi-tree-sitter/__tests__/service-registry.test.ts` only as needed to keep the existing behavior asserted after the internal storage swap.

## TDD
1. Adjust `packages/supi-tree-sitter/__tests__/service-registry.test.ts` first if the new helper affects how you prove normalization or module sharing.
2. Run `pnpm vitest run packages/supi-tree-sitter/__tests__/service-registry.test.ts -v` and confirm it fails before the migration.
3. Implement the registry migration and package manifest update.
4. Re-run the verification command until tests and typechecks pass.
