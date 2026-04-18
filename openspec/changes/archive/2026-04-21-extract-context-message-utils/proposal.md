## Why

`supi-claude-md` and `supi-lsp` independently implement the same context-message management pattern: filter stale messages by `customType` + token, then reorder the active message before the last user message. This logic (`getContextToken`, `findLastUserMessageIndex`, and the prune-reorder function) is duplicated across `refresh.ts` and `guidance.ts`. Extracting it into `supi-core` removes ~60 lines of duplication and provides a reusable primitive for future extensions that inject managed context messages.

## What Changes

- Add a new `context-messages.ts` module to `supi-core` with the shared types (`ContextMessageLike`) and functions (`getContextToken`, `findLastUserMessageIndex`, `pruneAndReorderContextMessages`).
- Export the new module from `supi-core/index.ts`.
- Replace `pruneStaleRefreshMessages` in `supi-claude-md/refresh.ts` with a call to `pruneAndReorderContextMessages` from `supi-core`.
- Replace `reorderDiagnosticContextMessages` in `supi-lsp/guidance.ts` with a call to `pruneAndReorderContextMessages` from `supi-core`.
- Remove the now-unused local `getContextToken`, `findLastUserMessageIndex`, `ContextMessageLike` definitions from both packages.
- Update all test mocks and imports that reference the removed local functions.

## Capabilities

### New Capabilities

- `context-message-pruning`: Shared context-message prune-and-reorder utility for extensions that inject managed `customType` messages into the LLM context via `before_agent_start` and maintain them via the `context` event.

### Modified Capabilities

- `lsp-diagnostic-context`: Replaces the local `reorderDiagnosticContextMessages` implementation with the shared `pruneAndReorderContextMessages` from `supi-core`. No behavior change — same filtering and reordering semantics.

## Impact

- `packages/supi-core/`: new module + exports
- `packages/supi-claude-md/refresh.ts`: remove ~30 lines, add import
- `packages/supi-claude-md/index.ts`: update import (function name changes)
- `packages/supi-lsp/guidance.ts`: remove ~30 lines, add import
- `packages/supi-lsp/lsp.ts`: update import (function name changes)
- Test files in both packages: update mocks and imports
