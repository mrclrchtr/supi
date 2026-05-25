# Task 5: Extract shared project-model and workspace-context ownership into supi-code-runtime

## Goal
Move project-model building and workspace-context ownership into `packages/supi-code-runtime/` so `packages/supi-code-intelligence/` stops owning the canonical workspace model.

## Files
- `packages/supi-code-runtime/src/project/model.ts`
- `packages/supi-code-runtime/src/project/workspace-detectors.ts`
- `packages/supi-code-runtime/src/session/workspace-context.ts`
- `packages/supi-code-runtime/src/api.ts`
- `packages/supi-code-runtime/src/index.ts`
- `packages/supi-code-runtime/__tests__/unit/project-model.test.ts`
- `packages/supi-code-runtime/__tests__/unit/workspace-context.test.ts`
- `packages/supi-code-intelligence/src/architecture.ts`
- `packages/supi-code-intelligence/src/api.ts`
- `packages/supi-code-intelligence/src/index.ts`
- `packages/supi-code-intelligence/__tests__/unit/architecture-compat.test.ts`

## Change
- Start with failing tests for project-model construction and workspace-context caching in the new runtime package.
- Move the package/workspace detection logic into `packages/supi-code-runtime/src/project/` and expose it through `src/api.ts` / `src/index.ts`.
- Add a shared workspace-context primitive in `packages/supi-code-runtime/src/session/workspace-context.ts` that can memoize provider access and project-model state per workspace.
- Reduce `packages/supi-code-intelligence/src/architecture.ts` to a compatibility wrapper over the runtime package so downstream imports keep working during the migration.
- Update `packages/supi-code-intelligence/src/api.ts` and `src/index.ts` to re-export the new source of truth without changing public names.

## Verification
TDD required.

Run in order:
- `pnpm exec vitest run packages/supi-code-runtime/__tests__/unit/project-model.test.ts packages/supi-code-runtime/__tests__/unit/workspace-context.test.ts packages/supi-code-runtime/__tests__/unit/workspace-session.test.ts`
- `pnpm exec vitest run packages/supi-code-intelligence/__tests__/unit/architecture-compat.test.ts`
- `pnpm exec tsc --noEmit -p packages/supi-code-runtime/tsconfig.json`
- `pnpm exec tsc --noEmit -p packages/supi-code-runtime/__tests__/tsconfig.json`
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`
- `pnpm exec biome check packages/supi-code-runtime packages/supi-code-intelligence`

Expected result: runtime project-model/context tests fail first, then pass while `packages/supi-code-intelligence/` continues to compile through the compatibility wrapper.
