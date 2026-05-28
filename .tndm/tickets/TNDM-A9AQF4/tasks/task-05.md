# Task 5: Update extension registration and planner tests for substrate removal + code_health

## Goal

Update the extension registration test and any other tests that assert lsp_* or tree_sitter_* tools are publicly registered.

## Files

### `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`

**Remove these test cases:**
- `"registers tree_sitter_* expert tools"` — tree_sitter tools are no longer public
- `"registers lsp_* expert tools"` — lsp tools are no longer public

**Update these test cases:**
- `"registers the focused tool set from shared specs"` — update the count/expectation line comment from `code_* (8) + lsp_* (10) + tree_sitter_* (6) + read/write/edit overrides (3)` to `code_* (10) + read/write/edit overrides (3)`. The `toBeGreaterThanOrEqual` assertion should still pass since code_health is now in the spec list.

**Add this test case:**
- `"registers code_health tool"` — verify code_health is present with correct parameters (scope, refresh, include, level)

**Update "does not register inactive V2 workflow tools":**
- Add `"code_health"` to the list of tools that ARE now registered (remove it from the excluded list)

### `packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts`

If this test iterates over all tool names or has specific route assertions, add `code_health` to the expected tool list.

### Other test files

Run the full test suite and fix any failures from removed substrate tools:
```bash
pnpm vitest run packages/supi-code-intelligence/
```

Common failure patterns to expect:
- Tests that iterate over all registered tool names may need `code_health` added
- Tests that mock `registerLspTools` or `registerTsTools` may have unused imports
- Tests that assert specific tool counts may need updating

## Verification

```bash
pnpm vitest run packages/supi-code-intelligence/
```

All tests pass. No lsp_* or tree_sitter_* tools in the registration test assertions (except where explicitly testing library code).
