# Task 5: Remove tree-sitter tool-edge handler APIs so the substrate stays library-only

## Goal
Finish the library-only boundary for `@mrclrchtr/supi-tree-sitter` by removing handler-style string-formatting APIs and keeping all `tree_sitter_*` expert-tool presentation in `@mrclrchtr/supi-code-intelligence`.

## Files
- update `packages/supi-tree-sitter/src/api.ts`
- update `packages/supi-tree-sitter/src/index.ts`
- update `packages/supi-tree-sitter/src/session/session.ts`
- update `packages/supi-tree-sitter/src/tool/structure.ts`
- delete `packages/supi-tree-sitter/src/tool/handlers.ts`
- delete `packages/supi-tree-sitter/src/tool/formatting.ts`
- update `packages/supi-code-intelligence/src/tool/families/tree-sitter/execute.ts`
- update `packages/supi-code-intelligence/src/tool/families/tree-sitter/format.ts`
- add `packages/supi-tree-sitter/__tests__/unit/api.test.ts`
- update `packages/supi-tree-sitter/__tests__/unit/session.test.ts`
- update `packages/supi-tree-sitter/__tests__/unit/provider.test.ts`
- update `packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`

## Change
1. **RED**: add `packages/supi-tree-sitter/__tests__/unit/api.test.ts` proving the public `./api` surface exposes structured runtime/service APIs only and no longer requires tool-handler exports.
2. Move any remaining `tree_sitter_*` markdown/text formatting fully into `packages/supi-code-intelligence/src/tool/families/tree-sitter/format.ts` and `packages/supi-code-intelligence/src/tool/families/tree-sitter/execute.ts`.
3. Remove `packages/supi-tree-sitter/src/tool/handlers.ts` and `packages/supi-tree-sitter/src/tool/formatting.ts` once `supi-code-intelligence` no longer imports them.
4. Update `packages/supi-tree-sitter/src/api.ts` and `packages/supi-tree-sitter/src/index.ts` so the published library surface is limited to runtime/session/service/provider types and helpers.
5. Keep `packages/supi-tree-sitter/src/session/session.ts` and `packages/supi-tree-sitter/src/tool/structure.ts` as the structured library entrypoints that power the umbrella’s expert-tool execution.

## Verification
- **RED then GREEN**: `RTK_DISABLED=1 pnpm vitest run -v packages/supi-tree-sitter/__tests__/unit/api.test.ts packages/supi-tree-sitter/__tests__/unit/session.test.ts packages/supi-tree-sitter/__tests__/unit/provider.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`
- **Typecheck**: `pnpm exec tsc -b packages/supi-tree-sitter/tsconfig.json packages/supi-tree-sitter/__tests__/tsconfig.json packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`

## Test strategy
Test-driven. Prove the public Tree-sitter API is handler-free before deleting the old tool-edge files.
