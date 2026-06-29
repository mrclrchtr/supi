# Task 1: RED: codify always-on LSP policy and per-language disable behavior in supi-lsp

## Goal
Lock the new semantic-substrate policy before runtime changes land:
- `lsp.enabled` no longer disables LSP startup
- `lsp.active` no longer filters detected servers
- `lsp.servers.<language>.enabled: false` still disables that language explicitly
- deprecated keys are ignored rather than producing a globally disabled runtime

## Files
- `packages/supi-lsp/__tests__/unit/config.test.ts`
- `packages/supi-lsp/__tests__/unit/runtime-controller.test.ts`
- `packages/supi-lsp/__tests__/unit/service-registry.test.ts` (only if the runtime-state expectations need to change)

## Change
- Add failing config tests that prove project/global merging still supports per-language `enabled: false`, including project-level re-enable overriding a global disable.
- Add failing runtime-controller tests that prove `LspRuntimeController.start()` no longer returns the globally disabled path when `lsp.enabled: false` is present.
- Add failing runtime-controller tests that prove `lsp.active` is ignored and detected workspace servers are still attempted.
- Add failing assertions that deprecated keys are treated as ignored inputs instead of active runtime switches.

## Verification
- Run `RTK_DISABLED=1 pnpm vitest run packages/supi-lsp/__tests__/unit/config.test.ts packages/supi-lsp/__tests__/unit/runtime-controller.test.ts --reporter=verbose`.
- Confirm the new assertions fail for the expected reasons before implementation.

## TDD
This is a RED task. Do not change production code here.
