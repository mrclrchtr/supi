## Context

`supi-claude-md` provides two capabilities: subdirectory context injection and root context refresh. The refresh mechanism re-injects root CLAUDE.md content via `before_agent_start` persistent messages, pruned by the `context` event. This is essential for recovery after compaction.

However, pi already loads the root CLAUDE.md natively via `systemPromptOptions.contextFiles` at session startup, placing it in the "Project Context" section of the system prompt. The extension's `createInitialState()` sets `needsRefresh: true`, causing `shouldRefreshRoot()` to return `true` on turn 0, which re-injects the identical content.

Current turn-0 call chain:
1. `createInitialState()` → `needsRefresh: true`
2. `before_agent_start` → `captureNativePaths()` records paths from `systemPromptOptions.contextFiles`
3. `shouldRefreshRoot(state, config)` → `state.needsRefresh` is `true` → returns `true`
4. `readNativeContextFiles()` + `formatRefreshContext()` → wraps same files in `<extension-context>` tag
5. Duplicate context in the conversation

## Goals / Non-Goals

**Goals:**
- Eliminate duplicate root CLAUDE.md at session start
- Preserve correct refresh behavior after compaction (`session_compact` → `needsRefresh = true`)
- Preserve periodic refresh at `rereadInterval` turns
- Preserve correct behavior on session reconstruction from branch history

**Non-Goals:**
- Changing the refresh interval or config schema
- Modifying subdirectory injection behavior
- Adding deduplication logic against native system prompt content (the fix is simpler — just don't trigger refresh when it's unnecessary)

## Decisions

### 1. Initialize `needsRefresh: false` instead of `true`

**Decision**: Change `createInitialState()` to set `needsRefresh: false`.

**Rationale**: The only legitimate source of `needsRefresh = true` is the `session_compact` handler (compaction wipes context, so re-injection is needed). Starting with `false` means turn 0 skips injection, and the first periodic refresh fires at turn `rereadInterval` (default 3).

**Alternative considered**: Add a `firstAgentStart` guard in `shouldRefreshRoot()`. Rejected — it conflates path-capture tracking with refresh logic, and `firstAgentStart` is already `true` on turn 0 before `captureNativePaths()` sets it to `false`. This would require ordering guarantees between `shouldRefreshRoot()` and `captureNativePaths()` calls.

### 2. Remove `completedTurns === 0` override in session_start reconstruction

**Decision**: Remove the line `state.needsRefresh = reconstructed.completedTurns === 0` from the `session_start` handler.

**Rationale**: When reconstructing from a branch with 0 completed turns, the native context is still present in the system prompt. Setting `needsRefresh = true` here causes the same duplication. The `rereadInterval`-based check in `shouldRefreshRoot()` will handle the first refresh correctly since `lastRefreshTurn` starts at 0 and `completedTurns` is 0, so `turnDelta` will reach `rereadInterval` naturally.

### 3. Set `lastRefreshTurn: 0` remains correct

**Decision**: No change to `lastRefreshTurn` initialization.

**Rationale**: With `needsRefresh: false` and `lastRefreshTurn: 0`, the first refresh happens when `completedTurns - 0 >= rereadInterval` (default: turn 3). This is correct — native context is fresh at turn 0 and doesn't need re-injection until several turns have passed.

## Risks / Trade-offs

- **Risk**: Session reconstruction from a branch that had `needsRefresh = true` at serialization time loses that flag. → **Mitigation**: Branches with 0 turns have fresh native context anyway. Branches with >0 turns use `lastRefreshTurn` from reconstruction, and the interval check handles timing correctly.
- **Risk**: Compaction followed immediately by a branch reload might miss a refresh. → **Mitigation**: `session_compact` handler sets `needsRefresh = true` and runs after `session_start` reconstruction, so the flag is set correctly for the current session.
