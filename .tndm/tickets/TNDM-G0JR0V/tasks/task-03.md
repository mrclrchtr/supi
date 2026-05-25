# Task 3: Publish structural capability metadata from supi-tree-sitter into the shared broker

## Goal
Upgrade `supi-tree-sitter` so the planner can discover structural capability state and structural evidence through the same shared broker used by the LSP substrate.

## Files
- Modify `packages/supi-tree-sitter/src/provider/tree-sitter-provider.ts`
- Modify `packages/supi-tree-sitter/src/session/runtime-registration.ts`
- Modify `packages/supi-tree-sitter/src/api.ts` only if the planner needs additional public types
- Modify tests:
  - `packages/supi-tree-sitter/__tests__/unit/provider.test.ts`
  - `packages/supi-tree-sitter/__tests__/unit/runtime-registration.test.ts`
- Update docs if public API wording changes:
  - `packages/supi-tree-sitter/README.md`
  - `packages/supi-tree-sitter/CLAUDE.md`

## Change
Follow TDD.

### RED
1. Extend `packages/supi-tree-sitter/__tests__/unit/provider.test.ts` with failing cases that prove the provider output matches the richer broker contract expected by the planner.
2. Extend `packages/supi-tree-sitter/__tests__/unit/runtime-registration.test.ts` with failing expectations that structural capability registration preserves other broker slots and advertises structural readiness correctly.
3. Run:
   - `RTK_DISABLED=1 pnpm vitest run packages/supi-tree-sitter/__tests__/unit/provider.test.ts packages/supi-tree-sitter/__tests__/unit/runtime-registration.test.ts -v`
   Confirm the failures are about the new broker contract rather than unrelated parser behavior.

### GREEN
4. Update `packages/supi-tree-sitter/src/provider/tree-sitter-provider.ts` so structural results map cleanly into the canonical shared runtime contract introduced in Task 1.
5. Update `packages/supi-tree-sitter/src/session/runtime-registration.ts` so tree-sitter startup/shutdown publishes structural capability state into the broker without disturbing semantic/refactor state.
6. Update `packages/supi-tree-sitter/src/api.ts` only if additional exported types are required by `supi-code-intelligence`; avoid widening the API surface unnecessarily.

### REFACTOR
7. Keep standalone `tree_sitter_*` behavior unchanged while simplifying any adapter/registration duplication introduced during the migration.
8. Update `packages/supi-tree-sitter/README.md` and `packages/supi-tree-sitter/CLAUDE.md` to describe the broker-backed structural publication accurately.

## Verification
Run all of the following:
- `RTK_DISABLED=1 pnpm vitest run packages/supi-tree-sitter/__tests__/unit/provider.test.ts packages/supi-tree-sitter/__tests__/unit/runtime-registration.test.ts -v`
- `pnpm exec tsc -b packages/supi-tree-sitter/tsconfig.json packages/supi-tree-sitter/__tests__/tsconfig.json`
- `pnpm exec biome check packages/supi-tree-sitter`

## Test status
Test-driven.
