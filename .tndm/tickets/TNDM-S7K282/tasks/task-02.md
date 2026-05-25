# Task 2: Migrate `packages/supi-lsp/` to publish semantic and diagnostic capabilities through `supi-code-runtime`

## Goal
Make `supi-lsp` a clean semantic substrate that depends on `@mrclrchtr/supi-code-runtime`, publishes runtime-owned semantic/diagnostic capabilities by workspace, and no longer imports `@mrclrchtr/supi-code-intelligence/api`.

## Files
Modify:
- `packages/supi-lsp/package.json`
- `packages/supi-lsp/README.md`
- `packages/supi-lsp/CLAUDE.md`
- `packages/supi-lsp/src/api.ts`
- `packages/supi-lsp/src/lsp.ts`
- `packages/supi-lsp/src/session/service-registry.ts`
- `packages/supi-lsp/src/provider/lsp-semantic-provider.ts`
- `packages/supi-lsp/__tests__/unit/semantic-provider.test.ts`
- `packages/supi-lsp/__tests__/unit/service-registry.test.ts`

Create:
- `packages/supi-lsp/src/session/runtime-registration.ts`
- `packages/supi-lsp/__tests__/unit/runtime-registration.test.ts`

Delete:
- `packages/supi-lsp/src/provider/lsp-code-provider.ts`

## Change
Keep the public `lsp_*` tools and the existing `SessionLspService` surface intact, but move shared contract ownership out of code-intelligence.

Implementation requirements:
- add `@mrclrchtr/supi-code-runtime` to `dependencies` and `bundledDependencies`
- retype `src/provider/lsp-semantic-provider.ts` against runtime-owned capability interfaces
- create `src/session/runtime-registration.ts` to register/unregister semantic and diagnostic capabilities in the shared workspace runtime during session lifecycle
- update `src/lsp.ts` to call the new registration helper
- keep `src/session/service-registry.ts` focused on the LSP service itself, not cross-package code-intelligence composition
- remove the unified `CodeProvider` bridge file entirely
- update package docs to describe `supi-lsp` as a substrate that publishes runtime capabilities, not as a package that depends on code-intelligence contracts

Do not rename the public `lsp_*` tools.

## TDD
### RED
Before changing runtime code:
1. Add/adjust failing tests in:
   - `packages/supi-lsp/__tests__/unit/semantic-provider.test.ts`
   - `packages/supi-lsp/__tests__/unit/service-registry.test.ts`
   - `packages/supi-lsp/__tests__/unit/runtime-registration.test.ts`
2. Confirm a pre-change coupling check still shows the current reverse dependency:
   - `rg -n "@mrclrchtr/supi-code-intelligence/api" packages/supi-lsp/src packages/supi-lsp/__tests__`

The tests should cover:
- semantic adapter output still maps correctly
- runtime registration publishes the expected capability state by cwd
- session shutdown clears runtime state
- the LSP package no longer needs a `CodeProvider` wrapper to participate in the stack

### GREEN
Implement the runtime dependency, runtime registration, and contract migration until the tests pass.

### REFACTOR
Clean up redundant comments/imports and keep the public `/api` surface limited to stable LSP-facing exports.

## Verification
Run:
- `RTK_DISABLED=1 pnpm vitest run packages/supi-lsp/__tests__/unit/semantic-provider.test.ts packages/supi-lsp/__tests__/unit/service-registry.test.ts packages/supi-lsp/__tests__/unit/runtime-registration.test.ts -v`
- `RTK_DISABLED=1 pnpm exec tsc -b packages/supi-lsp/tsconfig.json packages/supi-lsp/__tests__/tsconfig.json -v`
- `RTK_DISABLED=1 pnpm exec biome check packages/supi-lsp -v`
- `rg -n "@mrclrchtr/supi-code-intelligence/api" packages/supi-lsp/src packages/supi-lsp/__tests__`

Expected result: tests/typecheck/biome pass, and the final `rg` command returns no source-code or test-code imports of `@mrclrchtr/supi-code-intelligence/api` inside `packages/supi-lsp/`.
