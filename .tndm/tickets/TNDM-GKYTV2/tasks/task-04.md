# Task 4: Reorganize tool families under src/tool, move substrate wiring under src/substrate, and relocate shared UI/override surfaces

## Goal
Give all three tool families (`code_*`, `lsp_*`, `tree_sitter_*`) one consistent metadata/register/execute pattern under `src/tool/`, isolate all direct substrate-controller wiring under `src/substrate/`, and relocate umbrella-owned UI / override surfaces into explicit homes.

## Files
- create `packages/supi-code-intelligence/src/tool/common/register-family.ts`
- create `packages/supi-code-intelligence/src/tool/common/validation.ts`
- create `packages/supi-code-intelligence/src/tool/families/code/specs.ts`
- create `packages/supi-code-intelligence/src/tool/families/code/guidance.ts`
- create `packages/supi-code-intelligence/src/tool/families/code/register.ts`
- create `packages/supi-code-intelligence/src/tool/families/code/execute.ts`
- create `packages/supi-code-intelligence/src/tool/families/code/execute-relations.ts`
- create `packages/supi-code-intelligence/src/tool/families/lsp/specs.ts`
- create `packages/supi-code-intelligence/src/tool/families/lsp/guidance.ts`
- create `packages/supi-code-intelligence/src/tool/families/lsp/register.ts`
- create `packages/supi-code-intelligence/src/tool/families/lsp/execute.ts`
- create `packages/supi-code-intelligence/src/tool/families/lsp/format.ts`
- create `packages/supi-code-intelligence/src/tool/families/tree-sitter/specs.ts`
- create `packages/supi-code-intelligence/src/tool/families/tree-sitter/guidance.ts`
- create `packages/supi-code-intelligence/src/tool/families/tree-sitter/register.ts`
- create `packages/supi-code-intelligence/src/tool/families/tree-sitter/execute.ts`
- create `packages/supi-code-intelligence/src/tool/families/tree-sitter/format.ts`
- create `packages/supi-code-intelligence/src/substrate/semantic/state.ts`
- create `packages/supi-code-intelligence/src/substrate/semantic/lifecycle.ts`
- create `packages/supi-code-intelligence/src/substrate/semantic/diagnostics.ts`
- create `packages/supi-code-intelligence/src/substrate/semantic/recovery.ts`
- create `packages/supi-code-intelligence/src/substrate/semantic/settings.ts`
- create `packages/supi-code-intelligence/src/substrate/semantic/overrides.ts`
- create `packages/supi-code-intelligence/src/substrate/structural/state.ts`
- create `packages/supi-code-intelligence/src/substrate/structural/lifecycle.ts`
- create `packages/supi-code-intelligence/src/ui/lsp-message-renderer.ts`
- update `packages/supi-code-intelligence/src/code-intelligence.ts`
- update `packages/supi-code-intelligence/src/tool/register-tools.ts`
- update `packages/supi-code-intelligence/src/tool/tool-specs.ts`
- update `packages/supi-code-intelligence/src/tool/guidance.ts`
- update `packages/supi-code-intelligence/src/lsp/register-tools.ts`
- update `packages/supi-code-intelligence/src/lsp/session-lifecycle.ts`
- update `packages/supi-code-intelligence/src/lsp/tool-actions.ts`
- update `packages/supi-code-intelligence/src/lsp/tool-specs.ts`
- update `packages/supi-code-intelligence/src/lsp/guidance.ts`
- update `packages/supi-code-intelligence/src/lsp/format-utils.ts`
- update `packages/supi-code-intelligence/src/lsp/diagnostic-injection.ts`
- update `packages/supi-code-intelligence/src/lsp/workspace-recovery.ts`
- update `packages/supi-code-intelligence/src/lsp/settings.ts`
- update `packages/supi-code-intelligence/src/lsp/tool-overrides.ts`
- update `packages/supi-code-intelligence/src/lsp/lsp-message-renderer.ts`
- update `packages/supi-code-intelligence/src/tree-sitter/register-tools.ts`
- update `packages/supi-code-intelligence/src/tree-sitter/session-lifecycle.ts`
- update `packages/supi-code-intelligence/src/tree-sitter/tool-actions.ts`
- update `packages/supi-code-intelligence/src/tree-sitter/tool-specs.ts`
- update `packages/supi-code-intelligence/src/tree-sitter/guidance.ts`
- update `packages/supi-code-intelligence/src/ui/code-intelligence-status-command.ts`
- update `packages/supi-code-intelligence/src/ui/code-intelligence-status-view.ts`
- add `packages/supi-code-intelligence/__tests__/unit/tool/register-family.test.ts`
- add `packages/supi-code-intelligence/__tests__/unit/tool/families/code/execute-relations.test.ts`
- update `packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`
- update `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`

## Change
1. **RED**: add `packages/supi-code-intelligence/__tests__/unit/tool/register-family.test.ts` proving one shared registration helper can register a tool family from specs without re-declaring metadata.
2. Move the current `code_*`, `lsp_*`, and `tree_sitter_*` metadata / guidance / registration / execution files into the new `packages/supi-code-intelligence/src/tool/families/*` layout. Encode the `code_relations` validation matrix in the shared tool/spec layer: `callers` accepts anchored, symbol, or file-group input; `callees` and `implementations` accept anchored or symbol input only.
3. Move direct `@mrclrchtr/supi-lsp/api` / `@mrclrchtr/supi-tree-sitter/api` session wiring, adapter state, diagnostics, recovery, settings, and LSP-aware read/write/edit overrides into `packages/supi-code-intelligence/src/substrate/semantic/*` and `packages/supi-code-intelligence/src/substrate/structural/*`.
4. Move umbrella-owned UI surfaces into explicit homes: `lsp-context` custom message rendering should live in `packages/supi-code-intelligence/src/ui/lsp-message-renderer.ts`, and `/ci-status` should read from the new app/session state in a way that stays consistent with the shared broker-backed capability view.
5. Update `packages/supi-code-intelligence/src/code-intelligence.ts` to compose the new tool-family, substrate, and UI modules instead of importing from the current mixed `src/lsp/`, `src/tree-sitter/`, and root `src/tool/` layout. Add a dedicated `packages/supi-code-intelligence/src/tool/families/code/execute-relations.ts` edge that follows the standard flow: validate → build request context → call relations service → render markdown/details.
6. Once callers have switched, reduce the old `packages/supi-code-intelligence/src/lsp/*`, `packages/supi-code-intelligence/src/tree-sitter/*`, and root `packages/supi-code-intelligence/src/tool/*` files to compatibility forwarders or delete them when they are no longer part of the intended structure.
7. Keep `lsp_references`, `lsp_implementation`, and `tree_sitter_callees` available as secondary debug surfaces during this refactor. `code_relations` should become the preferred high-level surface, but this task does not delete the lower-level expert tools.
8. Remove the current “interim port” / “replicated metadata” duplication by making the new family modules the real single source of truth.

## Verification
- **RED then GREEN**: `RTK_DISABLED=1 pnpm vitest run -v packages/supi-code-intelligence/__tests__/unit/tool/register-family.test.ts packages/supi-code-intelligence/__tests__/unit/tool/families/code/execute-relations.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`
- **Typecheck**: `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`

## Test strategy
Test-driven. Add the shared-family registration test first and watch it fail before reorganizing the tool, substrate, and UI modules.
