# Task 7: Full workspace verification — typecheck, lint, test suite, grep audit

Full workspace verification to confirm the change is correct end-to-end.

**Commands:**
1. `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json` — no type errors
2. `pnpm exec biome check packages/supi-code-intelligence/` — lint clean
3. `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/` — all tests pass (363+ passing, no regressions below the baseline)
4. `grep -rn 'code_pattern' packages/supi-code-intelligence/src/ packages/supi-code-intelligence/__tests__/` — only acceptable remaining references:
   - `workflow/surface.ts`: planned absorption metadata
   - No active tool registration, executor, or guidance references
5. `grep -rn 'execute-pattern' packages/supi-code-intelligence/src/` — only the use-case file (`generate-pattern.ts`) and its consumer (`execute-find.ts`) remain; no stale import of the deleted file

**Expected results:** All green. No regressions.
