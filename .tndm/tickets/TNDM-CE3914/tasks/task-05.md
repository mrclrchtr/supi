# Task 5: Verify: full test suite, typecheck, lint, manual smoke test

## Goal

Run the full test suite and verify the changes work end-to-end.

## Steps

1. Run the code-health specific tests:
   ```bash
   pnpm exec vitest run packages/supi-code-intelligence/__tests__/unit/code-health-tool.test.ts
   ```

2. Run the full supi-code-intelligence test suite:
   ```bash
   pnpm exec vitest run packages/supi-code-intelligence/
   ```

3. Run the TypeScript compiler check:
   ```bash
   pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
   ```

4. Run the Biome linter:
   ```bash
   pnpm exec biome check packages/supi-code-intelligence/src/tool/execute-health.ts packages/supi-code-intelligence/src/presentation/markdown/health.ts packages/supi-code-intelligence/__tests__/unit/code-health-tool.test.ts
   ```

5. Manual smoke test: Open a file with known LSP errors, run `code_health` with `level: "detailed"` and verify code action titles appear.

6. Manual smoke test: Run `code_health` with `level: "summary"` and verify no code actions appear.

## Verification

- All tests pass
- TypeScript compiles clean
- Biome reports no issues
- Manual smoke tests succeed
