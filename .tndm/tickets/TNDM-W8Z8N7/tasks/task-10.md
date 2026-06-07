# Task 10: Full end-to-end verification: test suite, typecheck, lint


## Goal
End-to-end verification that the readiness signal works correctly: all tests pass, workspaceSymbol returns results on the first call, and no regressions across the full test suite.

## Verification steps

### 1. Full unit test suite
```bash
pnpm exec vitest run packages/supi-lsp/__tests__/unit/
```
All tests pass, including the 10 new readiness tests and existing unit tests.

### 2. Full integration test suite
```bash
pnpm exec vitest run packages/supi-lsp/__tests__/integration/
```
All integration tests pass. The `workspaceSymbol` test no longer uses `waitFor` retry — the first call returns results. Readiness assertions pass.

### 3. Downstream test suite
```bash
pnpm exec vitest run packages/supi-code-intelligence/__tests__/
```
All downstream tests pass with updated mock shapes.

### 4. Full workspace typecheck
```bash
pnpm exec tsc -b
```
No type errors across the entire workspace.

### 5. Lint check
```bash
pnpm exec biome check packages/supi-lsp/ packages/supi-code-intelligence/
```
No new lint violations.

### 6. Manual smoke test (optional)
- Run pi with the updated supi-lsp.
- Execute `/reload`.
- Immediately run `code_resolve` on a symbol.
- Confirm it returns results (not empty) on the first call.
- Check `/supi-status` (or equivalent) to see `ready: true` for the TypeScript server.

## Success criteria
- Workspace typecheck passes with zero errors.
- Full test suite (unit + integration + downstream) passes.
- No `waitFor` retry pattern for `workspaceSymbol` remains.
- No `retryWorkspaceSymbolAfterWarmup` references remain in codebase.

