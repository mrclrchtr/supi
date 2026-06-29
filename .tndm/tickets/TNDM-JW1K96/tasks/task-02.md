# Task 2: GREEN: implement always-on LSP runtime policy and deprecated-key detection

## Goal
Implement the new LSP policy in the semantic substrate while preserving explicit per-language opt-out.

## Files
- `packages/supi-lsp/src/config/lsp-settings.ts`
- `packages/supi-lsp/src/session/runtime-controller.ts`
- `packages/supi-lsp/src/session/scanner.ts` (if additional startup metadata helpers are needed)
- `packages/supi-lsp/src/config/config.ts` (only if the existing per-language merge path needs adjustment)
- `packages/supi-lsp/__tests__/unit/config.test.ts`
- `packages/supi-lsp/__tests__/unit/runtime-controller.test.ts`
- `packages/supi-lsp/__tests__/unit/service-registry.test.ts` (only if touched by the implementation)

## Change
- Remove the effective runtime behavior of global `lsp.enabled` and `lsp.active` while keeping enough config introspection to let downstream packages warn that those keys are deprecated and ignored.
- Keep `lsp.servers.<language>.enabled: false` as the only supported way to disable semantic coverage for a language.
- Ensure `LspRuntimeController.start()` always attempts detected servers unless they were explicitly disabled per language.
- Expose or retain enough startup information for code-intelligence to distinguish:
  - detected language explicitly disabled
  - detected language missing its server binary
  - general semantic startup failure
- Keep the scope narrow: do not add user-facing warning rendering in this package.

## Verification
- Re-run `RTK_DISABLED=1 pnpm vitest run packages/supi-lsp/__tests__/unit/config.test.ts packages/supi-lsp/__tests__/unit/runtime-controller.test.ts --reporter=verbose` and confirm they pass.
- Run `pnpm exec tsc -b packages/supi-lsp/tsconfig.json packages/supi-lsp/__tests__/tsconfig.json`.
- Run `pnpm exec biome check packages/supi-lsp/src/config/lsp-settings.ts packages/supi-lsp/src/session/runtime-controller.ts packages/supi-lsp/src/session/scanner.ts packages/supi-lsp/__tests__/unit/config.test.ts packages/supi-lsp/__tests__/unit/runtime-controller.test.ts`.

## TDD
This is the GREEN task for Task 1. Do not broaden the change beyond the new runtime/config policy.
