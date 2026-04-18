## Why

The root CLAUDE.md is injected **twice** at session start — once by pi natively (in the system prompt's "Project Context" section) and again by `supi-claude-md`'s `before_agent_start` handler. This wastes ~5,857 chars of context on every conversation. The root cause is that `needsRefresh` initializes to `true` in `createInitialState()`, forcing an immediate root refresh on turn 0 when native context is already present.

## What Changes

- `createInitialState()` in `state.ts` initializes `needsRefresh` to `false` instead of `true`
- `session_start` handler in `index.ts` no longer sets `needsRefresh = true` when `reconstructed.completedTurns === 0`
- `shouldRefreshRoot()` in `refresh.ts` gets a new guard: returns `false` on the first `before_agent_start` when `firstAgentStart` is still being captured (i.e., native context was just loaded)
- Update existing tests that assert `needsRefresh: true` on fresh state to expect `false`

## Capabilities

### New Capabilities

_None_

### Modified Capabilities

_None_

## Impact

- **Code**: `packages/supi-claude-md/state.ts` (initial state), `packages/supi-claude-md/index.ts` (session_start reconstruction logic), `packages/supi-claude-md/refresh.ts` (shouldRefreshRoot guard)
- **Tests**: `packages/supi-claude-md/__tests__/refresh.test.ts`, `packages/supi-claude-md/__tests__/extension-lifecycle.test.ts`, `packages/supi-claude-md/__tests__/extension-refresh.test.ts` — initial state expectations and turn-0 refresh behavior
- **Behavior**: Root CLAUDE.md no longer duplicated at session start. First refresh happens at turn `rereadInterval` (default 3) or after compaction. No API or config changes.
