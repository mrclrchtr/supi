# Task 7: Final verification: full package tests, typecheck, Biome, manual resolve smoke test

## Goal

Confirm all six fixes are correct and don't break existing behavior.

## Verification steps

1. Run the full package test suite:
   ```
   RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/ -v
   ```
   Expect: all tests pass, including new tests for each fix.

2. Run typecheck:
   ```
   RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
   ```
   Expect: no errors.

3. Run Biome:
   ```
   RTK_DISABLED=1 pnpm exec biome check packages/supi-code-intelligence
   ```
   Expect: clean, no fixes needed.

4. Manual smoke test with `code_resolve` via pi:
   - `code_resolve({ file: "packages/supi-code-intelligence/src/tool/execute-brief.ts" })` → returns targets with semantic document symbols
   - `code_resolve({ query: "executeBriefTool", kind: "symbol" })` → resolves correctly
   - `code_resolve({ query: "executeBriefTool", kind: "command" })` → returns unsupported error
   - `code_resolve({ query: "service", maxResults: 1 })` → returns at most 1 candidate
   - `code_resolve({ query: "service", maxResults: 1 })` disambiguation output doesn't mention `code_context`

## Files touched by verification

None — verify-only task.
