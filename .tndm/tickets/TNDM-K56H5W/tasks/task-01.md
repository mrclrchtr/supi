# Task 1: Apply the non-committing revert baseline for 37ed313 and restore package ownership files

## Goal
Restore the pre-`37ed313` ownership model as the working baseline before any selective fix re-application.

## Files
- `package.json`
- `README.md`
- `scripts/__tests__/pack-staged.test.mjs`
- `packages/supi-lsp/package.json`
- `packages/supi-lsp/src/api.ts`
- `packages/supi-lsp/src/index.ts`
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
- `packages/supi-tree-sitter/package.json`
- `packages/supi-tree-sitter/src/api.ts`
- `packages/supi-tree-sitter/src/index.ts`
- `packages/supi-tree-sitter/src/extension.ts`
- `packages/supi-tree-sitter/src/tree-sitter.ts`
- `packages/supi-tree-sitter/src/tool/guidance.ts`
- `packages/supi-tree-sitter/src/tool/handlers.ts`
- `packages/supi-tree-sitter/src/tool/register-tools.ts`
- `packages/supi-tree-sitter/src/tool/tool-specs.ts`
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

## Change
1. Run `git revert --no-commit 37ed313` from the repo root.
2. Resolve any conflicts by restoring the pre-consolidation ownership model:
   - `packages/supi-lsp` owns `lsp_*` extension wiring and exports `./extension` again.
   - `packages/supi-tree-sitter` owns `tree_sitter_*` extension wiring and exports `./extension` again.
   - `packages/supi-code-intelligence` reverts to `code_*` orchestration and no longer hosts umbrella LSP/Tree-sitter extension code.
3. Do **not** make judgment calls about bundled bug fixes in this task except when required to complete the mechanical revert cleanly.
4. Leave the revert staged/uncommitted for the package-specific reconciliation tasks.

## Test status
**Test-exempt** for the revert step itself.

### Rationale
A cross-package VCS restore is not meaningfully driven by a new failing unit test before the baseline is in place.

## Verification
- `git diff --stat --cached`
- `git diff --name-only --cached`
- `git diff --cached -- package.json packages/supi-lsp/package.json packages/supi-tree-sitter/package.json packages/supi-code-intelligence/package.json`

### Expected result
- The staged diff is limited to the planned ownership, manifest, test, and doc files.
- `package.json` restores `./packages/supi-lsp/src/extension.ts` and `./packages/supi-tree-sitter/src/extension.ts` to the root `pi.extensions` list.
- `packages/supi-lsp/package.json` and `packages/supi-tree-sitter/package.json` again expose `./extension` and `pi.extensions`.
- `packages/supi-code-intelligence/package.json` no longer acts as the sole runtime host for `lsp_*` and `tree_sitter_*`.

