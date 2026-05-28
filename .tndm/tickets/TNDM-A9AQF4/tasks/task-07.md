# Task 7: Full workspace verification — typecheck, lint, test suite, manual smoke test

## Goal

Full workspace verification: typecheck, lint, full test suite.

## Commands

```bash
# TypeScript compilation
pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json

# Full test suite
pnpm vitest run packages/supi-code-intelligence/

# Biome lint
pnpm exec biome check packages/supi-code-intelligence/src/ packages/supi-code-intelligence/__tests__/

# Verify no stale lsp_*/tree_sitter_* references in tool guidance
rg 'lsp_\w+|tree_sitter_\w+' packages/supi-code-intelligence/src/tool/guidance.ts && echo "FAIL: substrate references remain" || echo "OK"

# Verify code_health is registered (run a quick script or check test output)
pnpm vitest run packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts -t "code_health"

# Verify code_brief still provides outline + imports + exports + diagnostics enrichment
pnpm vitest run packages/supi-code-intelligence/__tests__/unit/brief.test.ts
```

## Expected results

- TypeScript: zero errors
- Vitest: all tests pass
- Biome: no errors or warnings
- No `lsp_*` or `tree_sitter_*` references in `src/tool/guidance.ts`
- `code_health` is registered and tests pass
- `code_brief` enrichment still works (outline, imports, exports, diagnostics)
- `code_references`, `code_calls`, `code_implementations`, `code_refactor_plan`, `code_refactor_apply` tests still pass
- `/ci-status` tests still pass

## Manual verification

In a pi session:
1. `/reload` the extension
2. Verify `code_health` appears in the tool list
3. Verify `lsp_hover`, `tree_sitter_outline`, etc. do NOT appear
4. Verify `code_brief(file)` still provides enriched output
5. Run `code_health` and verify it returns diagnostic summary
