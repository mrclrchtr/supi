# Task 4: Verify full test suite passes

## Goal
Confirm the change doesn't break existing functionality.

## Verification Steps

1. Run the test discovery tests:
   ```bash
   pnpm vitest run packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts
   ```

2. Run the full supi-code-intelligence test suite:
   ```bash
   pnpm vitest run packages/supi-code-intelligence/
   ```

3. Run typecheck:
   ```bash
   pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json
   ```

4. Run lint:
   ```bash
   pnpm exec biome check packages/supi-code-intelligence/
   ```

## Expected Results
- All tests pass
- No type errors
- No lint errors
- New test case proves import-graph analysis works
