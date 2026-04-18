## Context

Two SuPi extensions (`supi-claude-md` and `supi-lsp`) independently implement the same context-message management pattern:

1. In `before_agent_start`: inject a message with a unique `customType` and `contextToken`
2. In `context`: filter stale messages by `customType` + token, keep only the active one, and reorder it before the last user message

The duplicated code spans three functions (`getContextToken`, `findLastUserMessageIndex`, and the prune-reorder function) and a shared type (`ContextMessageLike`), appearing in both `supi-claude-md/refresh.ts` and `supi-lsp/guidance.ts`.

Current locations:
- `packages/supi-claude-md/refresh.ts` → `pruneStaleRefreshMessages()`, `getContextToken()`, `findLastUserMessageIndex()`
- `packages/supi-lsp/guidance.ts` → `reorderDiagnosticContextMessages()`, `getContextToken()`, `findLastUserMessageIndex()`

## Goals / Non-Goals

**Goals:**
- Extract the shared prune-reorder pattern into `supi-core` so both extensions use a single implementation
- Remove the duplicated `getContextToken`, `findLastUserMessageIndex`, and `ContextMessageLike` type
- Preserve identical behavior — no semantic changes

**Non-Goals:**
- Adding `pi.events` coordination between extensions (future work)
- Adding context budget awareness or cross-extension coordination
- Changing the `customType` values or message formats
- Refactoring the `context` handler wiring itself (still each extension's responsibility)

## Decisions

### Decision: Generic `pruneAndReorderContextMessages` with `customType` parameter

The shared function takes a `customType` string parameter so each caller specifies which message type to manage. This is simpler than registering message types or using a lookup table.

```typescript
function pruneAndReorderContextMessages<T extends ContextMessageLike>(
  messages: T[],
  customType: string,
  activeToken: string | null,
): T[]
```

**Alternative considered:** A registry-based approach where extensions register their `customType` and a single shared `context` handler manages all of them. Rejected — pi calls `context` handlers in extension load order, so each extension already controls its own handler. A shared handler would require restructuring the event wiring across extensions.

### Decision: Place in `supi-core/context-messages.ts`

`supi-core` already houses shared infrastructure (`wrapExtensionContext`, config system). Context-message management fits naturally alongside `context-tag.ts`.

### Decision: Thin re-export wrappers for backward compatibility

Both `supi-claude-md/refresh.ts` and `supi-lsp/guidance.ts` will re-export the shared function under their original names (`pruneStaleRefreshMessages`, `reorderDiagnosticContextMessages`) as thin wrappers. This minimizes test changes — existing test mocks reference the local names, and the wrapper just delegates.

Wait — on reflection, this adds indirection for no real benefit. The tests mock the module, so changing the import name in the mock setup is trivial. Better to just update the call sites and test mocks directly. The old names were also misleading (`pruneStaleRefreshMessages` is too claude-md-specific, `reorderDiagnosticContextMessages` is too lsp-specific). The generic name `pruneAndReorderContextMessages` is clearer.

**Final decision:** Remove the old functions entirely, update call sites and test mocks to use the new name.

## Risks / Trade-offs

- **Risk: Behavioral difference from subtle implementation mismatch** → The two existing implementations are already identical in logic. The extraction copies one and verifies against both test suites. Running `pnpm verify` after extraction catches regressions.
- **Risk: Test churn** → Both packages have tests that mock these functions. Updating mock imports is mechanical but touches ~8 test files. Straightforward grep-and-replace.
- **Trade-off: `supi-core` gains a dependency on message structure** → The `ContextMessageLike` type is minimal (`role`, `customType`, `details`) and already implicitly shared. Making it explicit is an improvement.
