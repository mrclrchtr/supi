# Task 6: Update docs unit tests — adapt mocks to new client module

## Goal

Update `docs.test.ts` mocks so they work with the rewritten `context7-client.ts` exports.

## File

`packages/supi-web/__tests__/unit/docs.test.ts`

## Changes

1. Inspect the current `vi.mock("../../src/context7-client.ts", ...)` block — it mocks `searchLibrary`, `getContext`, and `Context7Error`
2. The mock interface should stay the same (same function names and `Context7Error` class), so verify it still works
3. If `Context7Error` class shape changed, update the mock's class accordingly
4. Run tests and fix any failures

## Verification

- `pnpm vitest run packages/supi-web/__tests__/unit/docs.test.ts` — all tests pass (GREEN)
