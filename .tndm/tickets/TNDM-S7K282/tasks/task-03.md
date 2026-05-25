# Task 3: Migrate `packages/supi-tree-sitter/` to publish structural capabilities through `supi-code-runtime`

## Goal
Make `supi-tree-sitter` a clean structural substrate that depends on `@mrclrchtr/supi-code-runtime`, publishes runtime-owned structural capabilities by workspace, and no longer imports `@mrclrchtr/supi-code-intelligence/api`.

## Files
Modify:
- `packages/supi-tree-sitter/package.json`
- `packages/supi-tree-sitter/README.md`
- `packages/supi-tree-sitter/CLAUDE.md`
- `packages/supi-tree-sitter/src/api.ts`
- `packages/supi-tree-sitter/src/tree-sitter.ts`
- `packages/supi-tree-sitter/src/session/service-registry.ts`
- `packages/supi-tree-sitter/src/provider/tree-sitter-provider.ts`
- `packages/supi-tree-sitter/__tests__/unit/provider.test.ts`
- `packages/supi-tree-sitter/__tests__/unit/service-registry.test.ts`

Create:
- `packages/supi-tree-sitter/src/session/runtime-registration.ts`
- `packages/supi-tree-sitter/__tests__/unit/runtime-registration.test.ts`

Delete:
- `packages/supi-tree-sitter/src/provider/tree-sitter-code-provider.ts`

## Change
Keep the public `tree_sitter_*` tools and the existing shared Tree-sitter service intact, but move shared contract ownership out of code-intelligence.

Implementation requirements:
- add `@mrclrchtr/supi-code-runtime` to `dependencies` and `bundledDependencies`
- retype `src/provider/tree-sitter-provider.ts` against runtime-owned structural capability interfaces
- create `src/session/runtime-registration.ts` to register/unregister the structural capability in the shared workspace runtime during session lifecycle
- update `src/tree-sitter.ts` to call the new registration helper
- keep `src/session/service-registry.ts` focused on the Tree-sitter service itself, not code-intelligence composition concerns
- remove the unified `CodeProvider` wrapper file entirely
- update package docs to describe `supi-tree-sitter` as a standalone structural substrate that publishes runtime capabilities

Do not rename the public `tree_sitter_*` tools.

## TDD
### RED
Before changing runtime code:
1. Add/adjust failing tests in:
   - `packages/supi-tree-sitter/__tests__/unit/provider.test.ts`
   - `packages/supi-tree-sitter/__tests__/unit/service-registry.test.ts`
   - `packages/supi-tree-sitter/__tests__/unit/runtime-registration.test.ts`
2. Confirm a pre-change coupling check still shows the current reverse dependency:
   - `rg -n "@mrclrchtr/supi-code-intelligence/api" packages/supi-tree-sitter/src packages/supi-tree-sitter/__tests__`

The tests should cover:
- structural adapter output stays unchanged
- runtime registration publishes structural capability state by cwd
- session shutdown clears structural runtime state
- the Tree-sitter package no longer needs a `CodeProvider` wrapper to participate in the stack

### GREEN
Implement the runtime dependency, runtime registration, and contract migration until the tests pass.

### REFACTOR
Tidy any duplicate mapping helpers and keep the public `/api` surface focused on Tree-sitter-owned services and types.

## Verification
Run:
- `RTK_DISABLED=1 pnpm vitest run packages/supi-tree-sitter/__tests__/unit/provider.test.ts packages/supi-tree-sitter/__tests__/unit/service-registry.test.ts packages/supi-tree-sitter/__tests__/unit/runtime-registration.test.ts -v`
- `RTK_DISABLED=1 pnpm exec tsc -b packages/supi-tree-sitter/tsconfig.json packages/supi-tree-sitter/__tests__/tsconfig.json -v`
- `RTK_DISABLED=1 pnpm exec biome check packages/supi-tree-sitter -v`
- `rg -n "@mrclrchtr/supi-code-intelligence/api" packages/supi-tree-sitter/src packages/supi-tree-sitter/__tests__`

Expected result: tests/typecheck/biome pass, and the final `rg` command returns no source-code or test-code imports of `@mrclrchtr/supi-code-intelligence/api` inside `packages/supi-tree-sitter/`.
