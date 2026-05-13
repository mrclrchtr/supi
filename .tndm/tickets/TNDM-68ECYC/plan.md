## Plan: Fix terminal title race between tab-spinner and ask-user

### Files
- `packages/supi-ask-user/src/ask-user.ts` — emit `supi:ask-user:start` / `supi:ask-user:end`
- `packages/supi-extras/src/tab-spinner.ts` — listen, pause/resume, fix unbalanced `supi:working:end`
- `packages/supi-ask-user/__tests__/execute.test.ts` — verify event emission
- `packages/supi-extras/__tests__/tab-spinner.test.ts` — pause/resume tests, remove stale comment

---

- [x] **Task 1**: Emit `supi:ask-user:start` / `supi:ask-user:end` from ask-user.ts
  - In `executeAskUser`, after `signalAttention(ctx)`, emit `pi.events.emit("supi:ask-user:start", { source: "supi-ask-user" })`
  - In the `finally` block, before `restoreTerminalTitle`, emit `pi.events.emit("supi:ask-user:end", { source: "supi-ask-user" })`
  - File: `packages/supi-ask-user/src/ask-user.ts`
  - Verification: `pnpm exec tsc --noEmit -p packages/supi-ask-user/tsconfig.json`

- [x] **Task 2**: Add ask-user event emission test
  - Update `fakePi()` in `execute.test.ts` to include `events: { emit: vi.fn(), on: vi.fn() }`
  - Add a test that calls `tool.execute` with a submitted outcome and asserts:
    - `events.emit` was called with `"supi:ask-user:start"`
    - `events.emit` was called with `"supi:ask-user:end"`
    - start was called before end
  - File: `packages/supi-ask-user/__tests__/execute.test.ts`
  - Verification: `pnpm vitest run packages/supi-ask-user/__tests__/execute.test.ts`

- [x] **Task 3**: Update tab-spinner to pause/resume on ask-user events and fix unbalanced working:end guard
  - Add `let hasActiveAgent = false;` and `let askUserActive = 0;` at module scope
  - In `agent_start` handler: set `hasActiveAgent = true` before `increment(ctx)`
  - In `agent_end` handler: set `hasActiveAgent = false` before `agentEnded()`
  - Add `pi.events.on("supi:ask-user:start", ...)` handler: increment `askUserActive`; if timer is running, `clearInterval(timer)` and `timer = null` (keep `frame` so resume continues from same position); set base title via `currentCtx.ui.setTitle(title())`
  - Add `pi.events.on("supi:ask-user:end", ...)` handler: decrement `askUserActive = Math.max(0, askUserActive - 1)`; if `askUserActive === 0` and `activeCount > 0`, call `start()` to resume spinner
  - Fix `decrement()`: `const floor = hasActiveAgent ? 1 : 0; activeCount = Math.max(floor, activeCount - 1);`
  - File: `packages/supi-extras/src/tab-spinner.ts`
  - Verification: `pnpm exec tsc --noEmit -p packages/supi-extras/tsconfig.json`

- [x] **Task 4**: Update tab-spinner tests for pause/resume and unbalanced guard
  - Remove the stale comment `// start() calls stop() first, which sets the base title` (line ~64)
  - Add test: during active spinner, `supi:ask-user:start` pauses the spinner (no new titles after tick), `supi:ask-user:end` resumes it (titles resume)
  - Add test: unbalanced `supi:working:end` (extra end without matching start) does not stop the spinner while agent is active
  - File: `packages/supi-extras/__tests__/tab-spinner.test.ts`
  - Verification: `pnpm vitest run packages/supi-extras/__tests__/tab-spinner.test.ts`

- [x] **Task 5**: Full regression sweep
  - Run full test suites for both packages
  - Command: `pnpm vitest run packages/supi-extras/ packages/supi-ask-user/`
  - Also run typecheck: `pnpm exec tsc --noEmit -p packages/supi-extras/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-ask-user/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-ask-user/__tests__/tsconfig.json`
