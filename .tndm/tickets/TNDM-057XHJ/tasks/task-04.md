# Task 4: Update test helper and all test files from "pattern" to "find" action

Replace the legacy `"pattern"` action in the test helper with a `"find"` action that routes to `executeFindTool`. Update all test files that use `action: "pattern"` to use `action: "find"` with equivalent parameters.

**Files:**
- `packages/supi-code-intelligence/__tests__/helpers/execute-action.ts` — replace `executePatternTool` import with `executeFindTool`, replace `"pattern"` action type with `"find"`, update the `case "pattern"` to `case "find"` routing to `executeFindTool`
- `packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts` — 8 refs: `action: "pattern"` → `action: "find"`; update error-message assertion that checks for "pattern"
- `packages/supi-code-intelligence/__tests__/unit/pattern-structured-search.test.ts` — 4 refs: `action: "pattern"` → `action: "find"`
- `packages/supi-code-intelligence/__tests__/unit/review-fixes.test.ts` — 4 refs: `action: "pattern"` → `action: "find"`
- `packages/supi-code-intelligence/__tests__/unit/pattern-summary.test.ts` — 3 refs: `action: "pattern"` → `action: "find"`
- `packages/supi-code-intelligence/__tests__/unit/pattern-duplicates.test.ts` — 1 ref: `action: "pattern"` → `action: "find"`

**Note:** When replacing `action: "pattern"` with `action: "find"`, params like `pattern` become `query` (the required param for code_find). The `kind` and `regex` params are compatible across both. Update `pattern-summary.test.ts`'s `summary` param usage — `code_find` doesn't have `summary`, but the test uses `executeAction` which passes all params through; the executor will ignore it. For the test at L175 that previously checked summary behavior, verify it still passes.

**Verification:** `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts packages/supi-code-intelligence/__tests__/unit/pattern-structured-search.test.ts packages/supi-code-intelligence/__tests__/unit/review-fixes.test.ts packages/supi-code-intelligence/__tests__/unit/pattern-summary.test.ts packages/supi-code-intelligence/__tests__/unit/pattern-duplicates.test.ts` — all pass
