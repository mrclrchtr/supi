# Task 6: Add test.concurrent annotations on independent tests

## Goal
Audit test files and add `test.concurrent` where tests within a `describe` block are independent, share no mutable state, and don't use `vi.useFakeTimers()`.

## Criteria (all must hold)
- Tests are in the same `describe` block
- No shared mutable state between tests (each test sets up its own data)
- No `vi.useFakeTimers()` usage (timers are global, can't be shared across concurrent tests)
- No serial execution dependency (no test output feeds into another test's input)

## Priority packages
Focus on highest test-count packages first:

1. **supi-code-intelligence** (22 test files) — check `__tests__/unit/` for independent describe blocks
2. **supi-core** (17 test files) — check `__tests__/unit/` for independent describe blocks
3. **supi-cache** (11 test files) — check for independent test clusters
4. **supi-review** (11 test files) — check for independent test clusters
5. **supi-claude-md** (10 test files) — check for independent test clusters

Skip:
- supi-lsp (has `isolate: true`, less benefit from concurrency)
- supi-tree-sitter (uses forks, WASM — not a good candidate)
- supi-bash-timeout (3 files, minimal gain)
- supi-debug (2 files, minimal gain)

## Pattern
```ts
// Before
describe("myFeature", () => {
  test("case 1", async () => { ... });
  test("case 2", async () => { ... });
});

// After — only where all criteria hold
describe("myFeature", () => {
  test.concurrent("case 1", async () => { ... });
  test.concurrent("case 2", async () => { ... });
});
```

## Verification
- `pnpm test` passes — no new failures.
- Run 5 consecutive times to confirm no flakiness introduced.
- `pnpm exec biome check packages/*/__tests__` passes.
- `pnpm typecheck` passes.

## TDD
No new tests needed — the existing test suite is the safety net. This is a refactor from serial to concurrent execution. If any test fails under concurrency, it reveals a hidden dependency that should be fixed or the test should stay serial.
