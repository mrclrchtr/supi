# Task 3: Remove "Text search" footer from code_find renderer

## Goal
Delete ~15 tokens of boilerplate footer from `code_find` text/regex output.

## Files
- `packages/supi-code-intelligence/src/presentation/markdown/pattern.ts`

## Changes

1. `renderPatternResults()`: Delete the trailing `_Text search — results may include comments, strings, or unrelated matches._` line (last `lines.push(...)` before `return`).

2. `renderPatternSummary()`: Delete the same trailing `_Text search — results may include comments, strings, or unrelated matches._` line.

## Verification
- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/` — no tests assert on this footer
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json`
