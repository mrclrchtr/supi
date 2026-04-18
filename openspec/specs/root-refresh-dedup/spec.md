# Root Refresh Dedup

Purpose: Ensure root context files are not duplicated at session start while preserving compaction-triggered refresh.

## Requirements

### Requirement: Root context is not duplicated at session start
The extension SHALL NOT inject root context files on turn 0 when pi has already loaded them natively via `systemPromptOptions.contextFiles`.

#### Scenario: Fresh session does not re-inject root CLAUDE.md
- **WHEN** a new session starts with `needsRefresh` initialized to `false` and `completedTurns` is 0
- **THEN** `shouldRefreshRoot()` SHALL return `false`
- **AND** no `supi-claude-md-refresh` message SHALL be emitted on the first `before_agent_start`

#### Scenario: First periodic refresh fires at rereadInterval
- **WHEN** a fresh session has `lastRefreshTurn` = 0 and `rereadInterval` = 3
- **THEN** the first root refresh SHALL occur when `completedTurns` reaches 3

### Requirement: Compaction-triggered refresh still works
The extension SHALL set `needsRefresh = true` on `session_compact` events (when `compactRefresh` is enabled), causing immediate re-injection on the next `before_agent_start`.

#### Scenario: Compaction forces immediate re-injection
- **WHEN** a `session_compact` event fires with `compactRefresh` enabled
- **THEN** `state.needsRefresh` SHALL be `true`
- **AND** the next `before_agent_start` SHALL emit a `supi-claude-md-refresh` message regardless of turn count
