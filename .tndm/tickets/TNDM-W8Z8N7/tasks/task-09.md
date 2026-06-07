# Task 9: Update downstream test mocks for new ProjectServerInfo.ready field


## Goal
Update test mocks in `supi-code-intelligence` tests that reference `ProjectServerInfo` to include the new `ready` field, and run the full test suite to confirm nothing is broken.

## Files to check and update
Search for test files that mock `ProjectServerInfo` or call `getProjectServers()`:

```bash
rg "ProjectServerInfo|getProjectServers" packages/supi-code-intelligence/__tests__/
```

For each mock shape that constructs a `ProjectServerInfo`-like object, add `ready: false` (or `true` as appropriate for the test scenario).

## Also check
- `packages/supi-lsp/__tests__/` — any test that constructs `ProjectServerInfo` shapes directly
- Test files that mock `SessionLspService.getProjectServers()` return value

## Verification
- Run: `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json` — compiles clean.
- Run: `pnpm exec vitest run packages/supi-code-intelligence/__tests__/` — all tests pass.
- Run: `pnpm exec vitest run packages/supi-lsp/__tests__/` — all tests pass.
- Run: `pnpm exec tsc -b` — full workspace typecheck passes.

