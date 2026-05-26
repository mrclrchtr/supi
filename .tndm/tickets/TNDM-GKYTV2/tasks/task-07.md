# Task 7: Run final cross-package verification for the modular code-intelligence refactor

## Goal
Prove the full refactor works end-to-end across the three affected packages and the updated architecture docs before the ticket is closed.

## Files
- verify `packages/supi-code-intelligence/tsconfig.json`
- verify `packages/supi-code-intelligence/__tests__/tsconfig.json`
- verify `packages/supi-tree-sitter/tsconfig.json`
- verify `packages/supi-tree-sitter/__tests__/tsconfig.json`
- verify `packages/supi-lsp/tsconfig.json`
- verify `packages/supi-lsp/__tests__/tsconfig.json`
- verify `docs/package-layout.md`
- verify `docs/tool-architecture.md`

## Change
No new code. Run the full package-level and workspace-level verification gates after every earlier task is green.

## Verification
1. **Cross-package tests**: `RTK_DISABLED=1 pnpm vitest run -v packages/supi-code-intelligence/__tests__/ packages/supi-tree-sitter/__tests__/ packages/supi-lsp/__tests__/`
2. **Cross-package typecheck**: `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json packages/supi-tree-sitter/tsconfig.json packages/supi-tree-sitter/__tests__/tsconfig.json packages/supi-lsp/tsconfig.json packages/supi-lsp/__tests__/tsconfig.json`
3. **Lint/docs check**: `pnpm exec biome check packages/supi-code-intelligence packages/supi-tree-sitter packages/supi-lsp docs/package-layout.md docs/tool-architecture.md`
4. **Whole-workspace gate**: `RTK_DISABLED=1 pnpm verify`
5. **Expected result**: all four commands succeed with no failing tests, no type errors, no Biome diagnostics, and no workspace verify failures.

## Test strategy
This is the required final verification task for the whole plan. Do not mark the ticket complete until every command above passes.
