# Task 1: Delete 8 dead modules in src/lsp/ and src/tree-sitter/

## Goal

Remove the following files that have zero external callers after TNDM-A9AQF4:

- `packages/supi-code-intelligence/src/lsp/register-tools.ts`
- `packages/supi-code-intelligence/src/lsp/tool-specs.ts`
- `packages/supi-code-intelligence/src/lsp/guidance.ts`
- `packages/supi-code-intelligence/src/lsp/tool-actions.ts`
- `packages/supi-code-intelligence/src/tree-sitter/register-tools.ts`
- `packages/supi-code-intelligence/src/tree-sitter/tool-specs.ts`
- `packages/supi-code-intelligence/src/tree-sitter/guidance.ts`
- `packages/supi-code-intelligence/src/tree-sitter/tool-actions.ts`

## Verification

- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json` — no type errors
- `pnpm vitest run packages/supi-code-intelligence/` — all tests pass
- Confirm no imports of `executeLspTool`, `executeTsTool`, `LSP_TOOL_DEFINITION_SPECS`, `TREE_SITTER_TOOL_SPECS`, `registerLspTools`, `registerTsTools`, `defaultLspToolPromptSurfaces`, `defaultTsToolPromptSurfaces` remain in live code

