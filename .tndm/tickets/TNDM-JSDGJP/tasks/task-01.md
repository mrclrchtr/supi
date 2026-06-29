# Task 1: RED: Lock the Phase 0 workflow skeleton contract in tests

# Goal

Write failing tests that define the non-behavioral Phase 0 skeleton contract before adding implementation files.

# Files

- Create `packages/supi-code-intelligence/__tests__/unit/workflow-surface.test.ts`
- Read existing registration tests in `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` for current surface expectations.

# Test-driven steps

1. Create `workflow-surface.test.ts` importing planned workflow-skeleton exports from `../../src/workflow/index.ts`.
2. Assert the planned V2 public surface names are exactly:
   - `code_resolve`
   - `code_context`
   - `code_find`
   - `code_graph`
   - `code_impact`
   - `code_refactor`
   - `code_apply`
   - `code_health`
3. Assert no planned workflow tool name starts with `lsp_` or `tree_sitter_`.
4. Assert every planned tool spec includes:
   - non-empty `purpose`
   - non-empty schema documentation
   - implementation phase label
   - absorbed current tools list or explicit empty list
   - non-goals list
5. Assert the skeleton does not use a broad `action` parameter. Permit `operation` only for `code_refactor`.
6. Assert `code_graph` relations include `references`, `callees`, `imports`, `exports`, `implements`, and `tests`, and do not include misleading `callers` until a true caller implementation exists.
7. Assert `code_find` modes include `text`, `regex`, `ast`, and `semantic`, and do not include `natural` in Phase 0.
8. Assert current runtime registration tests remain the source of truth for current public behavior; do not change runtime registration in this task.

# RED verification

Run:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/workflow-surface.test.ts -v
```

Expected result before implementation: test fails because `src/workflow/index.ts` or its exports do not exist yet. The failure should be a missing-module/export failure, not an unrelated runtime failure.
