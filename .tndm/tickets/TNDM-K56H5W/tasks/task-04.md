# Task 4: Slim supi-code-intelligence back to code_* orchestration only

## Goal
Return `packages/supi-code-intelligence` to owning only the `code_*` tools and its own overview/orchestration behavior, with no umbrella-hosted LSP or Tree-sitter extension surface.

## Files
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
- `packages/supi-code-intelligence/__tests__/unit/lsp-guidance.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/lsp-settings.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/lsp-tool-actions.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/tree-sitter-guidance.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/tree-sitter-tool-actions.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/tree-sitter-tool-registration.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/guidance.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`

## Change
### RED
1. Update `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`, `packages/supi-code-intelligence/__tests__/unit/guidance.test.ts`, and `packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts` so they assert the restored ownership boundary: `packages/supi-code-intelligence` registers only `code_*` tools and its own overview behavior.
2. Run those tests before source reconciliation so they fail while the umbrella-owned LSP/Tree-sitter wiring still exists.

### GREEN
1. Restore `packages/supi-code-intelligence/src/code-intelligence.ts` to the pre-`37ed313` shape that registers only code-intelligence-specific behavior.
2. Remove the umbrella-only LSP host files under `packages/supi-code-intelligence/src/lsp/`.
3. Remove the umbrella-only Tree-sitter host files under `packages/supi-code-intelligence/src/tree-sitter/`.
4. Remove `packages/supi-code-intelligence/src/ui/code-intelligence-status-command.ts` and `packages/supi-code-intelligence/src/ui/code-intelligence-status-view.ts`.
5. Reconcile `packages/supi-code-intelligence/package.json` so the package bundles and references `packages/supi-lsp` and `packages/supi-tree-sitter` extensions instead of directly hosting those tool families.
6. Delete or stop restoring the umbrella-only tests added by `37ed313`: `packages/supi-code-intelligence/__tests__/unit/lsp-guidance.test.ts`, `packages/supi-code-intelligence/__tests__/unit/lsp-settings.test.ts`, `packages/supi-code-intelligence/__tests__/unit/lsp-tool-actions.test.ts`, `packages/supi-code-intelligence/__tests__/unit/tree-sitter-guidance.test.ts`, `packages/supi-code-intelligence/__tests__/unit/tree-sitter-tool-actions.test.ts`, and `packages/supi-code-intelligence/__tests__/unit/tree-sitter-tool-registration.test.ts`.

### REFACTOR / SELECTIVE FIXES
- Keep `packages/supi-code-intelligence/src/substrates/lsp-adapter.ts` and `packages/supi-code-intelligence/src/substrates/tree-sitter-adapter.ts` unchanged except where needed to consume the restored substrate APIs.
- Preserve any `@`-path handling or resolution fixes only where they are actually part of `code_*` behavior (for example in `packages/supi-code-intelligence/src/resolve-target.ts` or `packages/supi-code-intelligence/src/target-resolution.ts`).

## Verification
- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts packages/supi-code-intelligence/__tests__/unit/guidance.test.ts`
- `pnpm exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json`
- `pnpm exec tsc --noEmit -p packages/supi-code-intelligence/__tests__/tsconfig.json`

### Expected result
- All listed tests pass.
- `packages/supi-code-intelligence` exposes only `code_*` plus its own overview/orchestration behavior.
- `lsp_*` and `tree_sitter_*` are no longer registered from this package.

