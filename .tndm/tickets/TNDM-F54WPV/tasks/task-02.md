# Task 2: Implement canonical shared runtime contracts in packages/supi-code-runtime

## Goal
Define the shared type system and workspace/session primitives that the semantic and structural packages will target.

## Files
- `packages/supi-code-runtime/src/types.ts`
- `packages/supi-code-runtime/src/provider/types.ts`
- `packages/supi-code-runtime/src/session/service-registry.ts`
- `packages/supi-code-runtime/src/session/workspace-session.ts`
- `packages/supi-code-runtime/__tests__/unit/provider-types.test.ts`
- `packages/supi-code-runtime/__tests__/unit/service-registry.test.ts`
- `packages/supi-code-runtime/__tests__/unit/workspace-session.test.ts`

## Change
- Start with failing unit tests for canonical shared result and capability behavior.
- Implement the shared types used across packages: positions, ranges, symbols, targets, diagnostics, confidence, and provider availability states.
- Define shared provider contracts in `src/provider/types.ts` for structural and semantic providers.
- Implement workspace-scoped session/service-registry helpers that model `pending`, `ready`, `disabled`, `inactive`, and `unavailable` consistently.
- Keep the API package-agnostic; do not import `packages/supi-lsp/` or `packages/supi-tree-sitter/` implementation modules here.

## Verification
TDD required.

Run in order:
- `pnpm exec vitest run packages/supi-code-runtime/__tests__/unit/provider-types.test.ts packages/supi-code-runtime/__tests__/unit/service-registry.test.ts packages/supi-code-runtime/__tests__/unit/workspace-session.test.ts`
- `pnpm exec tsc --noEmit -p packages/supi-code-runtime/tsconfig.json`
- `pnpm exec tsc --noEmit -p packages/supi-code-runtime/__tests__/tsconfig.json`
- `pnpm exec biome check packages/supi-code-runtime`

Expected result: the new unit tests fail first for the intended contract gaps, then pass once the shared runtime contracts are implemented.
