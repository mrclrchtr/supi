# Task 3: [TDD RED] Lock truthful code_health section behavior

## Goal
Capture the current mismatch between the public `code_health.include` contract and the actual collection/rendering behavior.

## Files
- `packages/supi-code-intelligence/__tests__/unit/code-health-tool.test.ts`

## Change
Extend the existing `code_health` test coverage with failing assertions for all of the following:
1. when `include` is omitted, the current default section behavior remains intact
2. when `include` is provided, only the requested sections render
3. `coverage` is a real section when requested
4. `unused` is a real section when requested
5. missing coverage/unused artifacts produce explicit requested-section notes instead of silently substituting diagnostics

Use the existing temp-directory and mock-provider patterns already present in the test file.

## Verification
Run the focused test file and confirm the new assertions fail before implementation changes:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-code-intelligence/__tests__/unit/code-health-tool.test.ts
```

Expected result: the new tests fail for the current implementation, proving the contract gap.

## Test mode
Test-driven (RED). Do not change implementation files in this task.
