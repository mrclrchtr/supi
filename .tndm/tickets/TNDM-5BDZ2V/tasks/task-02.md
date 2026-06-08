# Task 2: Remove substrate footer notes from code_graph renderer

## Goal
Delete ~25–50 tokens of substrate explanation footers from `code_graph` output.

## Files
- `packages/supi-code-intelligence/src/presentation/markdown/relations.ts`

## Changes

1. `renderCalleesResult()`: Delete the trailing lines that emit `_Structural analysis — may include unresolved or qualified names. Use code_inspect with file, line, and character for point facts, or code_context with file for broader orientation._` (the last `lines.push(...)` before `return`).

2. `renderImportsResult()`: Delete the trailing `_Structural analysis — shows module-level import statements._` line.

3. `renderExportsResult()`: Delete the trailing `_Structural analysis — shows top-level named exports._` line.

4. `renderImplementationsResult()`: Delete the trailing `_Semantic analysis. Use code_find (text mode) only when you explicitly want text-search hints for likely implementations._` line.

## Verification
- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/` — no tests assert on these footer strings
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json`
