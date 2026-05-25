# Task 3: Migrate supi-tree-sitter to the shared structural-provider contract

## Goal
Make `packages/supi-tree-sitter/` publish and reuse structural capabilities through `packages/supi-code-runtime/` while preserving the existing `tree_sitter_*` behavior.

## Files
- `packages/supi-tree-sitter/package.json`
- `packages/supi-tree-sitter/src/api.ts`
- `packages/supi-tree-sitter/src/index.ts`
- `packages/supi-tree-sitter/src/types.ts`
- `packages/supi-tree-sitter/src/tree-sitter.ts`
- `packages/supi-tree-sitter/src/session/runtime.ts`
- `packages/supi-tree-sitter/src/session/session.ts`
- `packages/supi-tree-sitter/src/session/service-registry.ts`
- `packages/supi-tree-sitter/src/provider/tree-sitter-provider.ts`
- `packages/supi-tree-sitter/__tests__/unit/provider.test.ts`
- `packages/supi-tree-sitter/__tests__/unit/service-registry.test.ts`
- `packages/supi-tree-sitter/__tests__/unit/session.test.ts`

## Change
- Add the new shared-runtime dependency in `packages/supi-tree-sitter/package.json`, then run `pnpm install` before further TypeScript edits.
- Write failing tests that pin the provider contract and shared-service behavior.
- Implement `src/provider/tree-sitter-provider.ts` as the structural-provider adapter backed by the existing runtime/session code.
- Refactor `src/session/session.ts` and `src/session/service-registry.ts` to publish shared-runtime-compatible session state instead of package-local-only shapes.
- Keep `src/api.ts`, `src/index.ts`, and `src/tree-sitter.ts` backwards-compatible for callers and tool registration.
- Keep tool output and supported-language behavior unchanged; this phase is architectural, not user-facing.

## Verification
TDD required.

Run in order:
- `pnpm install`
- `pnpm exec vitest run packages/supi-tree-sitter/__tests__/unit/provider.test.ts packages/supi-tree-sitter/__tests__/unit/service-registry.test.ts packages/supi-tree-sitter/__tests__/unit/session.test.ts`
- `pnpm vitest run packages/supi-tree-sitter/`
- `pnpm exec tsc --noEmit -p packages/supi-tree-sitter/tsconfig.json`
- `pnpm exec tsc --noEmit -p packages/supi-tree-sitter/__tests__/tsconfig.json`
- `pnpm exec biome check packages/supi-tree-sitter`

Expected result: the structural-provider tests fail first, then pass with no regressions in the package test suite.
