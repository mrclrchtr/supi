# Task 8: Final verification — typecheck, lint, full test suite, manual smoke test

## Goal

Full end-to-end verification: typecheck, lint, test suite, and manual smoke test.

## Steps

1. **Typecheck all affected packages:**
   ```bash
   pnpm exec tsc -b packages/supi-code-runtime/tsconfig.json
   pnpm exec tsc -b packages/supi-lsp/tsconfig.json
   pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json
   pnpm exec tsc -b packages/supi-code-intelligence/__tests__/tsconfig.json
   ```

2. **Lint:**
   ```bash
   pnpm exec biome check packages/supi-code-runtime/ packages/supi-lsp/ packages/supi-code-intelligence/ --max-diagnostics=20
   ```

3. **Run full test suite:**
   ```bash
   pnpm vitest run packages/supi-code-intelligence/
   pnpm vitest run packages/supi-lsp/
   ```

4. **Smoke test (manual):** verify code_brief with anchored file + line + character in a session with an active LSP shows hover type info for TypeScript sources.

5. **Git diff review:** confirm only the expected files changed, no unintentional modifications.

## Verification
- All typechecks pass
- All lint passes
- All tests pass (0 failures)
- Manual smoke test confirms hover info appears in anchored brief
- Git diff is clean (only expected changes)

