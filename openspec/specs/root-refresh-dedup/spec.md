# Root Refresh Dedup

Purpose: Ensure root context files are not duplicated at session start while preserving compaction-triggered refresh.

## Requirements

### Requirement: Root context is not duplicated at session start
The extension SHALL NOT inject root context files on turn 0 when pi has already loaded them natively via `systemPromptOptions.contextFiles`. Additionally, only files within the project tree (cwd) SHALL be eligible for re-injection during periodic refresh — files resolved outside cwd SHALL be excluded even when present in `contextFiles`. When the extension does inject a refresh message, it SHALL set `display: true` so the message is visible in the TUI with the registered `supi-claude-md-refresh` renderer.

#### Scenario: Fresh session does not re-inject root CLAUDE.md
- **WHEN** a new session starts with `needsRefresh` initialized to `false` and `completedTurns` is 0
- **THEN** `shouldRefreshRoot()` SHALL return `false`
- **AND** no `supi-claude-md-refresh` message SHALL be emitted on the first `before_agent_start`

#### Scenario: First periodic refresh fires at rereadInterval
- **WHEN** a fresh session has `lastRefreshTurn` = 0 and `rereadInterval` = 3
- **THEN** the first root refresh SHALL occur when `completedTurns` reaches 3

#### Scenario: Periodic refresh excludes files above cwd
- **WHEN** a periodic refresh triggers and `contextFiles` contains both `/Users/alice/AGENTS.md` and `/Users/alice/projects/myapp/CLAUDE.md` with `cwd` = `/Users/alice/projects/myapp`
- **THEN** the refresh message SHALL only include the project-level `CLAUDE.md`
- **AND** the home-directory `AGENTS.md` SHALL NOT appear in the refresh payload

#### Scenario: Refresh message is visible in TUI
- **WHEN** the extension emits a `supi-claude-md-refresh` message
- **THEN** the message SHALL have `display: true`
- **AND** the registered `supi-claude-md-refresh` renderer SHALL display a collapsible summary in the TUI

### Requirement: Compaction-triggered refresh still works
The extension SHALL set `needsRefresh = true` on `session_compact` events (when `compactRefresh` is enabled), causing immediate re-injection on the next `before_agent_start`.

#### Scenario: Compaction forces immediate re-injection
- **WHEN** a `session_compact` event fires with `compactRefresh` enabled
- **THEN** `state.needsRefresh` SHALL be `true`
- **AND** the next `before_agent_start` SHALL emit a `supi-claude-md-refresh` message regardless of turn count
