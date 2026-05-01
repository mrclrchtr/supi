## ADDED Requirements

### Requirement: Context threshold skips root refresh when context is nearly full

The root refresh logic SHALL check context window usage via `ctx.getContextUsage()`. When `percent` is not `null` and is greater than or equal to the `contextThreshold` config value, `shouldRefreshRoot()` SHALL return `false` and the `before_agent_start` handler SHALL skip injection, even if the turn-based `rereadInterval` has elapsed.

#### Scenario: Root refresh skipped when context usage exceeds threshold
- **WHEN** `completedTurns` is 3, `rereadInterval` is 3 (turn count says refresh is due), and `contextUsage.percent` is 85 with `contextThreshold` is 80
- **THEN** `shouldRefreshRoot()` SHALL return `false`
- **AND** the `before_agent_start` handler SHALL NOT emit a `supi-claude-md-refresh` message

#### Scenario: Root refresh proceeds when context usage is below threshold
- **WHEN** `completedTurns` is 3, `rereadInterval` is 3, and `contextUsage.percent` is 50 with `contextThreshold` is 80
- **THEN** `shouldRefreshRoot()` SHALL return `true`
- **AND** the handler SHALL proceed with normal refresh

#### Scenario: Null context usage is treated as not full
- **WHEN** `ctx.getContextUsage()` returns `undefined`, or returns an object with `percent: null` or `tokens: null`
- **THEN** the handler SHALL treat context as not full
- **AND** injection SHALL proceed based on turn count alone

#### Scenario: Default contextThreshold is 80
- **WHEN** no `contextThreshold` is configured in the supi config
- **THEN** the effective `contextThreshold` SHALL be 80

#### Scenario: contextThreshold of 100 disables context-gating
- **WHEN** `contextThreshold` is 100 and context usage is 99%
- **THEN** injection SHALL proceed normally (100% threshold is never exceeded)

### Requirement: Context threshold skips subdirectory re-injection but not first-time discovery

When context usage exceeds the threshold, subdirectory injection SHALL still inject context for directories that have never been seen before (`injectedDirs` has no entry). Only re-injections of already-seen directories (where the `rereadInterval` has elapsed) SHALL be skipped.

#### Scenario: First-time subdirectory injection always proceeds
- **WHEN** the agent accesses a file in `/src/auth/`, this directory is not in `injectedDirs`, and `contextUsage.percent` is 90 with `contextThreshold` is 80
- **THEN** the subdirectory context for `/src/auth/` SHALL still be injected

#### Scenario: Re-injection of already-seen directory skipped when context is full
- **WHEN** the agent accesses a file in `/src/auth/`, this directory was previously injected at turn 2 with `rereadInterval` is 3, `completedTurns` is 5 (re-injection is due), and `contextUsage.percent` is 85 with `contextThreshold` is 80
- **THEN** the re-injection SHALL be skipped

#### Scenario: Re-injection proceeds when context is below threshold
- **WHEN** the same conditions apply but `contextUsage.percent` is 60 with `contextThreshold` is 80
- **THEN** the re-injection SHALL proceed normally

### Requirement: contextThreshold is configurable via supi settings

The `contextThreshold` value SHALL be stored in the `claude-md` section of the supi config alongside `rereadInterval`, `subdirs`, and `fileNames`. It SHALL appear in the `/supi-settings` UI as a percentage setting for the claude-md extension.

#### Scenario: Config file stores contextThreshold
- **WHEN** `.pi/supi/config.json` contains `{ "claude-md": { "contextThreshold": 90 } }`
- **THEN** `loadClaudeMdConfig()` SHALL return `contextThreshold: 90`

#### Scenario: Settings UI exposes contextThreshold
- **WHEN** the user opens `/supi-settings` and views the claude-md section
- **THEN** `contextThreshold` SHALL appear as a setting with values ranging from 0 to 100 (in steps of 5)