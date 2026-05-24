# Task 3: Restore supi-tree-sitter as the owner of the tree_sitter_* extension surface and tests

## Goal
Make `packages/supi-tree-sitter` the standalone owner of the `tree_sitter_*` tool family again, including extension wiring, prompt guidance, handlers, and tests.

## Files
- `packages/supi-tree-sitter/package.json`
- `packages/supi-tree-sitter/src/api.ts`
- `packages/supi-tree-sitter/src/index.ts`
- `packages/supi-tree-sitter/src/extension.ts`
- `packages/supi-tree-sitter/src/tree-sitter.ts`
- `packages/supi-tree-sitter/src/session/runtime-controller.ts`
- `packages/supi-tree-sitter/src/tool/guidance.ts`
- `packages/supi-tree-sitter/src/tool/handlers.ts`
- `packages/supi-tree-sitter/src/tool/register-tools.ts`
- `packages/supi-tree-sitter/src/tool/tool-specs.ts`
- `packages/supi-tree-sitter/__tests__/guidance.test.ts`
- `packages/supi-tree-sitter/__tests__/smoke.test.ts`
- `packages/supi-tree-sitter/__tests__/tool-focus.test.ts`
- `packages/supi-tree-sitter/__tests__/tool.test.ts`

## Change
### RED
1. Restore the deleted tests listed above from the pre-`37ed313` baseline.
2. Run the focused Tree-sitter test commands before reconciling source so the restored tests fail for the expected missing/incorrect ownership reasons.

### GREEN
1. Restore `packages/supi-tree-sitter/src/extension.ts` and `packages/supi-tree-sitter/src/tree-sitter.ts` so the package again owns session lifecycle and `tree_sitter_*` tool registration.
2. Restore `packages/supi-tree-sitter/src/tool/guidance.ts`, `packages/supi-tree-sitter/src/tool/handlers.ts`, `packages/supi-tree-sitter/src/tool/register-tools.ts`, and `packages/supi-tree-sitter/src/tool/tool-specs.ts` so prompt metadata, parameter schemas, and execution stay with the substrate package.
3. Reconcile `packages/supi-tree-sitter/package.json`, `packages/supi-tree-sitter/src/api.ts`, and `packages/supi-tree-sitter/src/index.ts` so the package again publishes both `./api` and `./extension`.
4. Keep `packages/supi-tree-sitter/src/session/runtime-controller.ts` only if it remains a coherent optional library API after the revert; otherwise minimize/remove it so the public surface matches the restored ownership model.

### REFACTOR / SELECTIVE FIXES
Re-apply only the fixes that still make sense after the revert:
- `@`-prefixed file-path normalization in `packages/supi-tree-sitter/src/tool/handlers.ts` if the restored baseline still lacks it
- any packaging-surface cleanup required by the restored `./extension` export and `pi.extensions` manifest

## Verification
- `pnpm vitest run packages/supi-tree-sitter/__tests__/guidance.test.ts packages/supi-tree-sitter/__tests__/tool-focus.test.ts packages/supi-tree-sitter/__tests__/tool.test.ts packages/supi-tree-sitter/__tests__/smoke.test.ts`
- `pnpm exec tsc --noEmit -p packages/supi-tree-sitter/tsconfig.json`
- `pnpm exec tsc --noEmit -p packages/supi-tree-sitter/__tests__/tsconfig.json`

### Expected result
- All listed tests pass.
- `packages/supi-tree-sitter` is again a standalone install surface for `tree_sitter_*`.
- The package owns its own extension wiring instead of depending on `packages/supi-code-intelligence` to host it.

