# Task 8: Update integration tests: remove retry band-aid, add readiness + pull-diagnostics assertions


## Goal
Update the integration test to remove the `waitFor` retry band-aid that was masking the readiness gap, and verify the new readiness signal works end-to-end with real tsserver — covering both workspace symbols and pull diagnostics on first call.

## File
- `packages/supi-lsp/__tests__/integration/client.integration.test.ts`

## Changes

### 1. Remove the `waitFor` retry workaround (~L81-83)
Find the existing test that uses `waitFor` to retry `workspaceSymbol()` and replace with a direct assertion that the first call returns results:

```ts
// BEFORE (band-aid):
await waitFor(async () => {
  const results = await manager.workspaceSymbol("helloWorld");
  expect(results?.length).toBeGreaterThan(0);
});

// AFTER (readiness ensures this works first time):
const results = await manager.workspaceSymbol("helloWorld");
expect(results?.length).toBeGreaterThan(0);
```

### 2. Add readiness-specific integration assertions
- After `manager` starts and clients are running, read `getProjectServers()` and verify at least one server has `ready === true`.
- Call `workspaceSymbol()` immediately after startup — assert it returns non-empty results (not `[]` and not `null`).
- Call `hover()` on a known symbol position — assert it returns a result (not `null`).

### 3. Add pull diagnostics first-call assertion
- After startup, call `syncAndWaitForDiagnostics()` on the test file — assert it returns diagnostics on the first call (without retry). This validates the `pullDiagnosticsForUri` gating from Task 5.
- The existing `waitFor` retry at ~L117-122 (if present) should also be removed.

### 4. Verify warm-path still works
- Ensure the warm-project path test case still passes after the retry loop removal.

## Verification
- Run: `pnpm exec vitest run packages/supi-lsp/__tests__/integration/client.integration.test.ts`
- All integration tests pass, including the new readiness and pull-diagnostics assertions.
- Confirm no `waitFor` retry pattern remains in the integration test for workspace symbols or diagnostics.

