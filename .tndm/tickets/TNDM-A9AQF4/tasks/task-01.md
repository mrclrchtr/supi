# Task 1: [TDD RED] Write failing tests for code_health tool registration and execution

## Goal

Write tests that verify `code_health` is registered with the correct schema and produces expected output. Tests should fail because the tool isn't implemented yet.

## Files

**New:** `packages/supi-code-intelligence/__tests__/unit/code-health-tool.test.ts`

## Test cases

1. **Registration test** — `code_health` is registered with correct name, parameters (scope, refresh, include, level), and executable function
2. **Schema test** — parameters match the planned schema from `src/workflow/schemas.ts`: optional scope, refresh (boolean), include (array of "diagnostics"|"servers"|"dirty"), level ("summary"|"detailed")
3. **Executor test (no args)** — returns workspace diagnostic summary when LSP is available
4. **Executor test (scope)** — filters to a path when scope is provided
5. **Executor test (refresh)** — calls recoverDiagnostics when refresh is true
6. **Executor test (LSP unavailable)** — returns appropriate message when LSP is not ready

Use `createPiMock()` from `@mrclrchtr/supi-test-utils` and mock `getSessionLspService` from `@mrclrchtr/supi-lsp/api`.

## Verification

```bash
pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-health-tool.test.ts
```

Tests must fail for the right reason (tool not found in registration, or not-yet-implemented executor).
