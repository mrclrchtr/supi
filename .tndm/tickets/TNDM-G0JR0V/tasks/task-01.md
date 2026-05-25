# Task 1: Introduce a shared capability broker and canonical refactor-capable contracts in supi-code-runtime

## Goal
Create the shared runtime foundation for the redesigned platform: one broker for workspace capability state plus canonical shared types for semantic/structural evidence and optional semantic refactor support.

## Files
- Modify `packages/supi-code-runtime/src/capability/types.ts`
- Modify `packages/supi-code-runtime/src/types.ts`
- Modify `packages/supi-code-runtime/src/workspace/runtime.ts`
- Modify `packages/supi-code-runtime/src/workspace/context.ts`
- Modify `packages/supi-code-runtime/src/api.ts`
- Modify `packages/supi-code-runtime/__tests__/unit/workspace-runtime.test.ts`
- Add `packages/supi-code-runtime/__tests__/unit/capability-broker.test.ts`
- Update docs if exported API names/semantics change:
  - `packages/supi-code-runtime/README.md`
  - `packages/supi-code-runtime/CLAUDE.md`

## Change
Follow TDD.

### RED
1. Add failing tests in `packages/supi-code-runtime/__tests__/unit/capability-broker.test.ts` for:
   - registering semantic and structural capabilities independently
   - preserving other capability slots when one slot is replaced or cleared
   - exposing explicit availability states for missing/inactive/ready capabilities
   - exposing semantic metadata that indicates whether refactor operations are available without adding a third independent broker slot
2. Extend `packages/supi-code-runtime/__tests__/unit/workspace-runtime.test.ts` with failing cases that prove the old runtime behavior is insufficient for the new broker contract.
3. Run:
   - `RTK_DISABLED=1 pnpm vitest run packages/supi-code-runtime/__tests__/unit/capability-broker.test.ts packages/supi-code-runtime/__tests__/unit/workspace-runtime.test.ts -v`
   Confirm failure is for the expected missing broker/refactor behavior.

### GREEN
4. Evolve `packages/supi-code-runtime/src/capability/types.ts` so the runtime can describe the richer provider surface needed by the planner. Define concrete shared contracts for optional semantic refactoring, including:
   - a `RefactorProvider`-equivalent interface or optional semantic-provider methods for rename/code-action style operations
   - a `RefactorResult`-equivalent discriminator that distinguishes precise, ambiguous, and unavailable outcomes
   - canonical `WorkspaceEdit` / file-edit value types used by the apply path
5. Update `packages/supi-code-runtime/src/types.ts` and `packages/supi-code-runtime/src/workspace/runtime.ts` so one broker instance owns semantic and structural capability slots per workspace, with semantic capability metadata indicating refactor readiness.
6. Update `packages/supi-code-runtime/src/workspace/context.ts` and `packages/supi-code-runtime/src/api.ts` so downstream packages consume the broker and shared refactor types through the public API rather than private imports.

### REFACTOR
7. Remove or simplify any redundant helper/state code created while going green, but keep `src/api.ts` as the single supported public surface.
8. Update `packages/supi-code-runtime/README.md` and `packages/supi-code-runtime/CLAUDE.md` so the package documents the broker and optional semantic refactor support accurately.

## Verification
Run all of the following:
- `RTK_DISABLED=1 pnpm vitest run packages/supi-code-runtime/__tests__/unit/capability-broker.test.ts packages/supi-code-runtime/__tests__/unit/workspace-runtime.test.ts -v`
- `pnpm exec tsc -b packages/supi-code-runtime/tsconfig.json packages/supi-code-runtime/__tests__/tsconfig.json`
- `pnpm exec biome check packages/supi-code-runtime`

## Test status
Test-driven.
