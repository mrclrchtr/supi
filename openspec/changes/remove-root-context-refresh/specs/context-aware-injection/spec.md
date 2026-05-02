## MODIFIED Requirements

### Requirement: Context threshold skips subdirectory re-injection but not first-time discovery
When context usage exceeds the threshold, subdirectory injection SHALL still inject context for directories that have never been seen before (`injectedDirs` has no entry). Only re-injections of already-seen directories (where the `rereadInterval` has elapsed) SHALL be skipped. The threshold SHALL NOT control root/native context refresh because root/native context refresh SHALL NOT be emitted.

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
The `contextThreshold` value SHALL be stored in the `claude-md` section of the supi config alongside `rereadInterval`, `subdirs`, and `fileNames`. It SHALL appear in the `/supi-settings` UI as a percentage setting for the claude-md extension. The value SHALL gate only subdirectory re-injection of already-seen directories.

#### Scenario: Config file stores contextThreshold
- **WHEN** `.pi/supi/config.json` contains `{ "claude-md": { "contextThreshold": 90 } }`
- **THEN** `loadClaudeMdConfig()` SHALL return `contextThreshold: 90`

#### Scenario: Settings UI exposes contextThreshold
- **WHEN** the user opens `/supi-settings` and views the claude-md section
- **THEN** `contextThreshold` SHALL appear as a setting with values ranging from 0 to 100 (in steps of 5)

## REMOVED Requirements

### Requirement: Context threshold skips root refresh when context is nearly full
**Reason**: Root/native context refresh is removed. Pi-native instruction files are already present in the system prompt, so the extension no longer needs threshold logic to decide whether to duplicate them.

**Migration**: Keep `contextThreshold` for subdirectory re-injection only. Remove tests and implementation branches that call `shouldRefreshRoot()` or gate `supi-claude-md-refresh` messages by context usage.

#### Scenario: Root refresh is absent regardless of threshold
- **WHEN** `completedTurns` is 3, `rereadInterval` is 3, and `contextUsage.percent` is any value
- **THEN** the `before_agent_start` handler SHALL NOT emit a `supi-claude-md-refresh` message
