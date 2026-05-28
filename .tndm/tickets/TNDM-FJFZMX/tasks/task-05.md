# Task 5: Full verification — typecheck, lint, test suite, dead-code audit

## Goal

Run the full verification suite to confirm the cleanup didn't break anything:

1. **Typecheck**: `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`
2. **Lint**: `pnpm exec biome check packages/supi-code-intelligence/`
3. **Tests**: `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/`
4. **Manual**: confirm `pnpm vitest run` output shows all test files pass (38+ files, 0 failures)
5. **Dead code audit**: `grep -rn "executeLspTool\|executeTsTool\|registerLspTools\|registerTsTools" packages/supi-code-intelligence/src/ --include="*.ts"` returns no matches (confirming dead code is fully removed)

## Lint note

After deleting the source files, Biome may flag unused suppression comments (e.g. `// biome-ignore` in remaining files that previously suppressed errors related to imports from the deleted files). If so, remove those unused suppression comments.

