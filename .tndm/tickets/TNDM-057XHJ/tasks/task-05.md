# Task 5: Remove code_pattern-specific tests from registration and routing suites

Remove `code_pattern`-specific tests from test files that test tool registration and routing.

**Files:**
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` — remove the `code_pattern` registration test block (`it("registers regex and kind parameters on code_pattern"...)`). Remove `code_pattern` from the expected tool name list if one exists. Check for any tool count assertions that include code_pattern.
- `packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts` — remove the `code_pattern` routing test (`it("routes code_pattern to search-preferred...")`)

**Verification:** `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts` — all pass
