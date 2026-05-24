# Task 2: Restore supi-lsp as the owner of the LSP extension surface and its tests

## Goal
Make `packages/supi-lsp` the standalone owner of the `lsp_*` tool family again, including extension wiring, settings, diagnostic injection, overrides, renderer, status UI, and tests.

## Files
- `packages/supi-lsp/package.json`
- `packages/supi-lsp/src/api.ts`
- `packages/supi-lsp/src/index.ts`
- `packages/supi-lsp/src/config/capabilities.ts`
- `packages/supi-lsp/src/config/lsp-settings.ts`
- `packages/supi-lsp/src/config/tsconfig-scope.ts`
- `packages/supi-lsp/src/extension.ts`
- `packages/supi-lsp/src/lsp.ts`
- `packages/supi-lsp/src/format.ts`
- `packages/supi-lsp/src/handlers/diagnostic-injection.ts`
- `packages/supi-lsp/src/handlers/session-lifecycle.ts`
- `packages/supi-lsp/src/handlers/status-command.ts`
- `packages/supi-lsp/src/handlers/workspace-recovery.ts`
- `packages/supi-lsp/src/manager/manager-project-info.ts`
- `packages/supi-lsp/src/session/lsp-state.ts`
- `packages/supi-lsp/src/session/runtime-controller.ts`
- `packages/supi-lsp/src/session/service-registry.ts`
- `packages/supi-lsp/src/session/settings-registration.ts`
- `packages/supi-lsp/src/session/tree-persist.ts`
- `packages/supi-lsp/src/tool/guidance.ts`
- `packages/supi-lsp/src/tool/names.ts`
- `packages/supi-lsp/src/tool/overrides.ts`
- `packages/supi-lsp/src/tool/register-tools.ts`
- `packages/supi-lsp/src/tool/service-actions.ts`
- `packages/supi-lsp/src/tool/tool-specs.ts`
- `packages/supi-lsp/src/ui/renderer.ts`
- `packages/supi-lsp/src/ui/ui.ts`
- `packages/supi-lsp/src/workspace-change.ts`
- `packages/supi-lsp/__tests__/integration/e2e-smoke.test.ts`
- `packages/supi-lsp/__tests__/integration/service-actions.integration.test.ts`
- `packages/supi-lsp/__tests__/integration/service-actions-workspace.integration.test.ts`
- `packages/supi-lsp/__tests__/unit/focused-tools.test.ts`
- `packages/supi-lsp/__tests__/unit/format.test.ts`
- `packages/supi-lsp/__tests__/unit/guidance.test.ts`
- `packages/supi-lsp/__tests__/unit/overrides.test.ts`
- `packages/supi-lsp/__tests__/unit/overrides-cascade.test.ts`
- `packages/supi-lsp/__tests__/unit/renderer.test.ts`
- `packages/supi-lsp/__tests__/unit/service-actions.test.ts`
- `packages/supi-lsp/__tests__/unit/service-actions.recover.test.ts`
- `packages/supi-lsp/__tests__/unit/service-actions.validation.test.ts`
- `packages/supi-lsp/__tests__/unit/settings-registration.test.ts`
- `packages/supi-lsp/__tests__/unit/system-prompt.test.ts`
- `packages/supi-lsp/__tests__/unit/tool-specs.test.ts`
- `packages/supi-lsp/__tests__/unit/ui.test.ts`
- `packages/supi-lsp/__tests__/unit/workspace-sentinel-recovery.test.ts`

## Change
### RED
1. Restore the deleted `packages/supi-lsp/__tests__/integration/*` and `packages/supi-lsp/__tests__/unit/*` files listed above from the pre-`37ed313` baseline.
2. Run the focused LSP test commands before reconciling source so the restored tests fail for the expected missing/incorrect ownership reasons.

### GREEN
1. Restore `packages/supi-lsp/src/extension.ts` and `packages/supi-lsp/src/lsp.ts` so the package again registers its own `lsp_*` tools, settings, prompt guidance, overrides, message renderer, and status command.
2. Restore the deleted source files under `packages/supi-lsp/src/handlers/`, `packages/supi-lsp/src/tool/`, `packages/supi-lsp/src/ui/`, `packages/supi-lsp/src/session/`, `packages/supi-lsp/src/format.ts`, and `packages/supi-lsp/src/workspace-change.ts`.
3. Reconcile `packages/supi-lsp/package.json`, `packages/supi-lsp/src/api.ts`, and `packages/supi-lsp/src/index.ts` so the package again publishes both `./api` and `./extension` and matches the restored extension ownership.
4. Keep `packages/supi-lsp/src/session/runtime-controller.ts` only if it still stands as a useful library API after the revert; otherwise remove or minimize it so the package surface stays coherent.

### REFACTOR / SELECTIVE FIXES
Re-apply only the low-level fixes that still make sense in the restored package-owned model:
- active-server multi-select behavior in `packages/supi-lsp/src/config/lsp-settings.ts` and `packages/supi-lsp/src/session/settings-registration.ts`
- tsconfig cache invalidation in `packages/supi-lsp/src/config/tsconfig-scope.ts`
- DocumentSymbol children formatting in `packages/supi-lsp/src/manager/manager-project-info.ts` and any corresponding formatter path in `packages/supi-lsp/src/tool/service-actions.ts`
- `@`-prefixed path handling in `packages/supi-lsp/src/tool/service-actions.ts` if the restored baseline lacks it

## Verification
- `pnpm vitest run packages/supi-lsp/__tests__/unit/focused-tools.test.ts packages/supi-lsp/__tests__/unit/guidance.test.ts packages/supi-lsp/__tests__/unit/service-actions.validation.test.ts packages/supi-lsp/__tests__/unit/settings-registration.test.ts packages/supi-lsp/__tests__/unit/renderer.test.ts`
- `pnpm vitest run packages/supi-lsp/__tests__/integration/service-actions.integration.test.ts packages/supi-lsp/__tests__/integration/service-actions-workspace.integration.test.ts packages/supi-lsp/__tests__/integration/e2e-smoke.test.ts`
- `pnpm exec tsc --noEmit -p packages/supi-lsp/tsconfig.json`
- `pnpm exec tsc --noEmit -p packages/supi-lsp/__tests__/tsconfig.json`

### Expected result
- All listed tests pass.
- `packages/supi-lsp` is again a standalone install surface for `lsp_*`.
- The package owns its own extension wiring instead of depending on `packages/supi-code-intelligence` to host it.

