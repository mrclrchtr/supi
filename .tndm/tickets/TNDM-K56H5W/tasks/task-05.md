# Task 5: Re-apply independent fixes selectively and finish cross-package packaging verification

## Goal
After the ownership revert is green package-by-package, keep only the independent fixes from `37ed313` that are still correct, and verify the final packaging/install surfaces end-to-end.

## Files
- `README.md`
- `package.json`
- `scripts/__tests__/pack-staged.test.mjs`
- `packages/supi-lsp/package.json`
- `packages/supi-lsp/src/config/lsp-settings.ts`
- `packages/supi-lsp/src/config/tsconfig-scope.ts`
- `packages/supi-lsp/src/manager/manager-project-info.ts`
- `packages/supi-lsp/src/tool/service-actions.ts`
- `packages/supi-lsp/__tests__/unit/settings-registration.test.ts`
- `packages/supi-lsp/__tests__/unit/tsconfig-scope.test.ts`
- `packages/supi-lsp/__tests__/unit/service-actions.validation.test.ts`
- `packages/supi-lsp/__tests__/unit/service-actions.test.ts`
- `packages/supi-tree-sitter/package.json`
- `packages/supi-tree-sitter/src/tool/handlers.ts`
- `packages/supi-tree-sitter/__tests__/tool.test.ts`
- `packages/supi-code-intelligence/package.json`
- `packages/supi-code-intelligence/src/resolve-target.ts`
- `packages/supi-code-intelligence/src/target-resolution.ts`
- `packages/supi-code-intelligence/__tests__/unit/target-resolution.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`

## Change
### RED
1. Restore/update the packaging and regression tests first:
   - `scripts/__tests__/pack-staged.test.mjs`
   - `packages/supi-lsp/__tests__/unit/settings-registration.test.ts`
   - `packages/supi-lsp/__tests__/unit/tsconfig-scope.test.ts`
   - `packages/supi-lsp/__tests__/unit/service-actions.validation.test.ts`
   - `packages/supi-lsp/__tests__/unit/service-actions.test.ts`
   - `packages/supi-tree-sitter/__tests__/tool.test.ts`
   - `packages/supi-code-intelligence/__tests__/unit/target-resolution.test.ts`
   - `packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`
2. Run those tests before re-applying any fix so failures identify which bundled improvements were lost by the revert.

### GREEN
1. Re-apply only the fixes that still make sense after ownership is restored:
   - active-server multi-select in `packages/supi-lsp/src/config/lsp-settings.ts`
   - tsconfig cache invalidation in `packages/supi-lsp/src/config/tsconfig-scope.ts`
   - DocumentSymbol children formatting in `packages/supi-lsp/src/manager/manager-project-info.ts`
   - `@`-prefixed path handling where it belongs in `packages/supi-lsp/src/tool/service-actions.ts`, `packages/supi-tree-sitter/src/tool/handlers.ts`, `packages/supi-code-intelligence/src/resolve-target.ts`, and `packages/supi-code-intelligence/src/target-resolution.ts`
2. Reconcile `README.md`, `package.json`, `packages/supi-lsp/package.json`, `packages/supi-tree-sitter/package.json`, and `packages/supi-code-intelligence/package.json` so docs and pack manifests match the final restored install surfaces.
3. Keep packaging verification improvements in `scripts/__tests__/pack-staged.test.mjs` when they are independent of the single-install-surface model.

## Verification
- `pnpm vitest run scripts/__tests__/pack-staged.test.mjs`
- `pnpm vitest run packages/supi-lsp/__tests__/unit/settings-registration.test.ts packages/supi-lsp/__tests__/unit/tsconfig-scope.test.ts packages/supi-lsp/__tests__/unit/service-actions.validation.test.ts packages/supi-lsp/__tests__/unit/service-actions.test.ts`
- `pnpm vitest run packages/supi-tree-sitter/__tests__/tool.test.ts`
- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/target-resolution.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`
- `pnpm verify`

### Expected result
- The retained fixes stay green after the ownership revert.
- Root/package manifests and README copy match the actual install surfaces.
- `pnpm verify` passes, including pack/publish checks.

