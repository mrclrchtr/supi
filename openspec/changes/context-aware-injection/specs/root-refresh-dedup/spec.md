## MODIFIED Requirements

### Requirement: Root context is not duplicated at session start
The extension SHALL NOT inject root context files on turn 0 when pi has already loaded them natively via `systemPromptOptions.contextFiles`. Additionally, only files within the project tree (cwd) SHALL be eligible for re-injection during periodic refresh — files resolved outside cwd SHALL be excluded even when present in `contextFiles`. When context window usage is at or above the `contextThreshold`, periodic refresh SHALL also be skipped regardless of turn count.

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

#### Scenario: Periodic refresh skipped when context usage exceeds threshold
- **WHEN** `completedTurns` equals `lastRefreshTurn + rereadInterval` (turn count says refresh is due) and `contextUsage.percent >= contextThreshold`
- **THEN** `shouldRefreshRoot()` SHALL return `false`
- **AND** no `supi-claude-md-refresh` message SHALL be emitted

#### Scenario: Periodic refresh proceeds when context usage is below threshold
- **WHEN** `completedTurns` equals `lastRefreshTurn + rereadInterval` and `contextUsage.percent < contextThreshold`
- **THEN** `shouldRefreshRoot()` SHALL return `true`
- **AND** the refresh SHALL proceed normally