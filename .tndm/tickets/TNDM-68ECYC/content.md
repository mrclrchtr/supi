# Design: Fix terminal title race between tab-spinner and ask-user

## Problem
When `ask_user` opens during an active agent turn, `signalAttention()` sets the terminal title to `●  pi — waiting for your input`. But the `tab-spinner` interval (started on `agent_start`) overwrites it every 80ms, so the user never sees the attention signal.

## Approved approach: Event-based coordination
`ask-user` emits `supi:ask-user:start` / `supi:ask-user:end` on `pi.events` around the questionnaire lifecycle. `tab-spinner` listens and pauses/resumes its interval, just like it already does for `supi:working:*`.

## Changes

### ask-user (`packages/supi-ask-user/src/ask-user.ts`)
- Emit `pi.events.emit("supi:ask-user:start", { source: "supi-ask-user" })` before showing the overlay
- Emit `pi.events.emit("supi:ask-user:end", { source: "supi-ask-user" })` in the `finally` block after the overlay closes

### tab-spinner (`packages/supi-extras/src/tab-spinner.ts`)
- Listen to `supi:ask-user:start` / `supi:ask-user:end` and pause/resume the spinner interval
- Keep the bell on `agent_end` (user confirmed they want it)
- Fix `supi:working:end` guard: ensure `activeCount` never drops below the baseline set by `agent_start` (add `hasActiveAgent` boolean)

### Tests
- `tab-spinner.test.ts`: add tests for pause/resume during ask-user events
- `execute.test.ts`: verify ask-user emits the events
- Remove stale comment in tab-spinner.test.ts

## Files
- `packages/supi-ask-user/src/ask-user.ts`
- `packages/supi-extras/src/tab-spinner.ts`
- `packages/supi-extras/__tests__/tab-spinner.test.ts`
- `packages/supi-ask-user/__tests__/execute.test.ts`
