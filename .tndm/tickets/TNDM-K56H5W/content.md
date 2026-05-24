## Implementation overview

### Scope check
This is a single coherent revert-and-reconcile plan for the code-understanding stack. It touches three tightly coupled packages (`packages/supi-lsp`, `packages/supi-tree-sitter`, `packages/supi-code-intelligence`) plus root packaging/docs, but the work is still one testable architectural change: restore substrate package ownership after `37ed313`.

### Strategy
1. Apply a mechanical revert of `37ed313` without committing so the pre-consolidation ownership model is restored as the working baseline.
2. Reconcile the restored baseline package-by-package:
   - `packages/supi-lsp` regains its extension/tool/UI/settings lifecycle.
   - `packages/supi-tree-sitter` regains its extension/tool lifecycle.
   - `packages/supi-code-intelligence` returns to `code_*` orchestration only.
3. Restore packaging/docs/tests to match that ownership model.
4. Re-apply only the low-level fixes from `37ed313` that are still desirable after the revert.
5. Run targeted package verification, then cross-package pack/publish checks.

### File map
#### Root packaging and docs
- `package.json` — restore workspace-root `pi.extensions` entries for `./packages/supi-lsp/src/extension.ts` and `./packages/supi-tree-sitter/src/extension.ts`.
- `README.md` — restore package-install guidance so `supi-lsp` and `supi-tree-sitter` are again first-class install surfaces, not hidden behind `supi-code-intelligence`.
- `scripts/__tests__/pack-staged.test.mjs` — restore explicit-surface expectations for `packages/supi-lsp` and `packages/supi-tree-sitter`, and restore bundled-dependency expectations for `packages/supi-code-intelligence`.

#### `packages/supi-lsp`
- `packages/supi-lsp/package.json`
- `packages/supi-lsp/src/extension.ts`
- `packages/supi-lsp/src/lsp.ts`
- `packages/supi-lsp/src/format.ts`
- `packages/supi-lsp/src/handlers/diagnostic-injection.ts`
- `packages/supi-lsp/src/handlers/session-lifecycle.ts`
- `packages/supi-lsp/src/handlers/status-command.ts`
- `packages/supi-lsp/src/handlers/workspace-recovery.ts`
- `packages/supi-lsp/src/session/lsp-state.ts`
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
- `packages/supi-lsp/src/api.ts`
- `packages/supi-lsp/src/index.ts`
- `packages/supi-lsp/src/config/capabilities.ts`
- `packages/supi-lsp/src/config/lsp-settings.ts`
- `packages/supi-lsp/src/config/tsconfig-scope.ts`
- `packages/supi-lsp/src/manager/manager-project-info.ts`
- Restored tests in `packages/supi-lsp/__tests__/integration/` and `packages/supi-lsp/__tests__/unit/` that were deleted by `37ed313`.

#### `packages/supi-tree-sitter`
- `packages/supi-tree-sitter/package.json`
- `packages/supi-tree-sitter/src/extension.ts`
- `packages/supi-tree-sitter/src/tree-sitter.ts`
- `packages/supi-tree-sitter/src/tool/guidance.ts`
- `packages/supi-tree-sitter/src/tool/handlers.ts`
- `packages/supi-tree-sitter/src/tool/register-tools.ts`
- `packages/supi-tree-sitter/src/tool/tool-specs.ts`
- `packages/supi-tree-sitter/src/api.ts`
- `packages/supi-tree-sitter/src/index.ts`
- `packages/supi-tree-sitter/src/session/runtime-controller.ts`
- Restored tests in `packages/supi-tree-sitter/__tests__/guidance.test.ts`, `packages/supi-tree-sitter/__tests__/smoke.test.ts`, `packages/supi-tree-sitter/__tests__/tool-focus.test.ts`, and `packages/supi-tree-sitter/__tests__/tool.test.ts`.

#### `packages/supi-code-intelligence`
- `packages/supi-code-intelligence/package.json`
- `packages/supi-code-intelligence/src/code-intelligence.ts`
- `packages/supi-code-intelligence/src/lsp/diagnostic-injection.ts`
- `packages/supi-code-intelligence/src/lsp/guidance.ts`
- `packages/supi-code-intelligence/src/lsp/lsp-message-renderer.ts`
- `packages/supi-code-intelligence/src/lsp/register-tools.ts`
- `packages/supi-code-intelligence/src/lsp/runtime-state.ts`
- `packages/supi-code-intelligence/src/lsp/session-lifecycle.ts`
- `packages/supi-code-intelligence/src/lsp/settings.ts`
- `packages/supi-code-intelligence/src/lsp/tool-actions-format.ts`
- `packages/supi-code-intelligence/src/lsp/tool-actions.ts`
- `packages/supi-code-intelligence/src/lsp/tool-names.ts`
- `packages/supi-code-intelligence/src/lsp/tool-overrides.ts`
- `packages/supi-code-intelligence/src/lsp/tool-specs.ts`
- `packages/supi-code-intelligence/src/tree-sitter/guidance.ts`
- `packages/supi-code-intelligence/src/tree-sitter/register-tools.ts`
- `packages/supi-code-intelligence/src/tree-sitter/session-lifecycle.ts`
- `packages/supi-code-intelligence/src/tree-sitter/tool-actions.ts`
- `packages/supi-code-intelligence/src/tree-sitter/tool-specs.ts`
- `packages/supi-code-intelligence/src/ui/code-intelligence-status-command.ts`
- `packages/supi-code-intelligence/src/ui/code-intelligence-status-view.ts`
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`
- Umbrella-only tests added by `37ed313`: `packages/supi-code-intelligence/__tests__/unit/lsp-guidance.test.ts`, `packages/supi-code-intelligence/__tests__/unit/lsp-settings.test.ts`, `packages/supi-code-intelligence/__tests__/unit/lsp-tool-actions.test.ts`, `packages/supi-code-intelligence/__tests__/unit/tree-sitter-guidance.test.ts`, `packages/supi-code-intelligence/__tests__/unit/tree-sitter-tool-actions.test.ts`, `packages/supi-code-intelligence/__tests__/unit/tree-sitter-tool-registration.test.ts`.

### Re-apply-only fix targets after the revert
Evaluate and keep only if still correct in the restored ownership model:
- `packages/supi-lsp/src/config/lsp-settings.ts` — active-server settings behavior.
- `packages/supi-lsp/src/config/tsconfig-scope.ts` — tsconfig cache invalidation.
- `packages/supi-lsp/src/manager/manager-project-info.ts` — DocumentSymbol children formatting.
- `packages/supi-lsp/src/tool/service-actions.ts` and `packages/supi-tree-sitter/src/tool/handlers.ts` — `@`-prefixed path handling if the restored baseline still lacks it.
- `scripts/__tests__/pack-staged.test.mjs` and related packaging manifests — independent pack/publish verification changes.
- `packages/supi-lsp/src/session/runtime-controller.ts` and `packages/supi-tree-sitter/src/session/runtime-controller.ts` — retain only if they remain useful substrate APIs without forcing umbrella-owned extension wiring.

### Verification strategy
- Package-specific RED/GREEN loops for restored test files before reconciling source.
- `pnpm vitest run scripts/__tests__/pack-staged.test.mjs`
- `pnpm vitest run packages/supi-lsp/__tests__/unit/focused-tools.test.ts packages/supi-lsp/__tests__/unit/guidance.test.ts packages/supi-lsp/__tests__/unit/service-actions.validation.test.ts packages/supi-lsp/__tests__/unit/settings-registration.test.ts packages/supi-lsp/__tests__/unit/renderer.test.ts`
- `pnpm vitest run packages/supi-lsp/__tests__/integration/service-actions.integration.test.ts packages/supi-lsp/__tests__/integration/service-actions-workspace.integration.test.ts packages/supi-lsp/__tests__/integration/e2e-smoke.test.ts`
- `pnpm exec tsc --noEmit -p packages/supi-lsp/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-lsp/__tests__/tsconfig.json`
- `pnpm vitest run packages/supi-tree-sitter/__tests__/guidance.test.ts packages/supi-tree-sitter/__tests__/tool-focus.test.ts packages/supi-tree-sitter/__tests__/tool.test.ts packages/supi-tree-sitter/__tests__/smoke.test.ts`
- `pnpm exec tsc --noEmit -p packages/supi-tree-sitter/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-tree-sitter/__tests__/tsconfig.json`
- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts packages/supi-code-intelligence/__tests__/unit/guidance.test.ts`
- `pnpm exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-code-intelligence/__tests__/tsconfig.json`
- Final sweep: `pnpm verify`

### Constraints
- Do not preserve the single-install-surface model from `37ed313`.
- Do not invent a new bundle package in this change.
- Preserve only low-level fixes that are independently justified after the ownership revert.
- Keep package README/manifests aligned with the actual install surface at the end of the change.
