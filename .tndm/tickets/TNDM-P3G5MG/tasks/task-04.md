# Task 4: Update extension registration test for code_find

**Goal:** Confirm `code_find` appears in the registered tool set with correct parameter shape.

**File:** `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`

**Changes:**

1. Add a new test `it("registers code_find tool with correct parameter shape")` that:
   - Creates a pi mock, calls the extension factory
   - Asserts `getTool(pi, "code_find")` is defined
   - Asserts `query` is in parameters (required — no `Optional` wrapper)
   - Asserts `scope`, `mode`, `kind`, `contextLines`, `maxResults` are optional parameters
   - Asserts `mode` enum contains `["text", "regex", "ast", "semantic"]`

2. Update the "inactive V2 tools" test to remove `code_find` from the expected-inactive list.

3. Update the existing `"registers the focused tool set from shared specs"` test to expect `CODE_INTELLIGENCE_TOOL_SPECS.length + 1` or just verify `code_find` is present in the registered tools (the test already does `for (const spec of CODE_INTELLIGENCE_TOOL_SPECS)` so adding the spec in task 1 should make this pass automatically — verify and adjust if needed).

**Verification:**
- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` — all tests pass
- No lsp_* or tree_sitter_* tools leak into the registered set

