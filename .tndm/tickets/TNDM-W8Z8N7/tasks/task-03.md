# Task 3: Write unit tests for LspClient readiness state machine (TDD — RED)


## Goal
Write the unit test file for the `LspClient` readiness state machine. These tests must FAIL (RED) before the implementation exists — they assert behavior that doesn't exist yet.

## File
- **NEW**: `packages/supi-lsp/__tests__/unit/client-readiness.test.ts`

## Test infrastructure
- Use `vi.useFakeTimers()` for time-based tests.
- Mock `JsonRpcClient` to capture notification/request handlers on the transport layer.
- Create `LspClient` instances with minimal config (e.g., `{ command: "echo", args: [], fileTypes: [".ts"], rootMarkers: [] }`).
- Use the `vi.hoisted()` pattern for module mocks.
- Follow existing test patterns from `client-refresh.test.ts` and `transport.test.ts`.

## Test cases

### 1. No progress → 2s window → ready
- Start client, advance 2s with fake timers. Assert `ready` is `true`, `getReady()` resolves immediately.

### 2. Single token: begin → end → ready
- Simulate `window/workDoneProgress/create` → `$/progress { kind: "begin" }` → `$/progress { kind: "end" }`. Assert `ready` true after end.

### 3. Multi-token: t1 begin → t2 begin → t1 end → t2 end → ready
- t1 begin (ready false), t2 begin (still false), t1 end (still false), t2 end → ready true.

### 4. begin without matching end → per-token timeout → ready
- Set `readinessTimeoutMs: 100`. Send begin. Advance 100ms. Assert `ready` true.

### 5. New begin after ready → ready flips false → re-resolves on end
- Resolve ready first. Send new begin. Assert ready false. Send end. Assert ready true.

### 6. Crash during waiting → _readyPromise rejects
- Send begin. Simulate process exit (status `"error"`). Assert `getReady()` rejects.

### 7. Shutdown while waiting → rejects pending
- Send begin. Call `shutdown()`. Assert `getReady()` rejects.

### 8. Token cleanup → no memory leak after end
- Send begin → end. Assert `trackedTokens` is empty, `tokenTimeouts` is empty.

### 9. request() returns null if ready rejects
- Mock readiness to reject. Call `client.hover(...)` → assert returns `null`.

### 10. No progress timer cancelled when `window/workDoneProgress/create` arrives
- Send `window/workDoneProgress/create` before 2s. Advance past 2s. Assert `ready` still `false` (not prematurely resolved).

### 11. No progress timer cancelled when first `$/progress { begin }` arrives (without prior `create`)
- Send `$/progress { kind: "begin" }` directly before 2s (server skips `create` request). Advance past 2s. Assert `ready` still `false` (timer was cancelled by the `begin`).

## Verification (RED phase)
- Run: `pnpm exec vitest run packages/supi-lsp/__tests__/unit/client-readiness.test.ts`
- Confirm ALL 11 tests FAIL (they reference methods/fields that don't exist yet).
- `pnpm exec tsc -b packages/supi-lsp/__tests__/tsconfig.json` — test file compiles (types may error on missing fields, that's expected as RED).
