## ADDED Requirements

### Requirement: Global config file at ~/.pi/agent/supi/config.json

The config system SHALL read global settings from `~/.pi/agent/supi/config.json`. The file SHALL contain a JSON object with namespaced sections per extension (e.g., `"claude-md"`, `"lsp"`). If the file does not exist or cannot be parsed, the system SHALL fall back to hardcoded defaults without error.

#### Scenario: Global config loaded

- **WHEN** `~/.pi/agent/supi/config.json` exists with `{ "claude-md": { "rereadInterval": 5 } }`
- **THEN** the `claude-md` section SHALL resolve `rereadInterval` as `5`

#### Scenario: Global config missing

- **WHEN** `~/.pi/agent/supi/config.json` does not exist
- **THEN** the system SHALL use hardcoded defaults for all extensions

#### Scenario: Global config malformed

- **WHEN** `~/.pi/agent/supi/config.json` contains invalid JSON
- **THEN** the system SHALL fall back to hardcoded defaults and SHALL NOT throw an error

### Requirement: Project config file at .pi/supi/config.json

The config system SHALL read project-specific overrides from `.pi/supi/config.json` relative to cwd. Project settings SHALL merge on top of global settings. If the file does not exist or cannot be parsed, the system SHALL use global settings (or defaults) without error.

#### Scenario: Project config overrides global

- **WHEN** global config has `{ "claude-md": { "rereadInterval": 3 } }` and project config has `{ "claude-md": { "rereadInterval": 10 } }`
- **THEN** `rereadInterval` SHALL resolve as `10`

#### Scenario: Partial project config merges with global

- **WHEN** global config has `{ "claude-md": { "rereadInterval": 5, "subdirs": true } }` and project config has `{ "claude-md": { "subdirs": false } }`
- **THEN** the resolved config SHALL be `{ "rereadInterval": 5, "subdirs": false }`

### Requirement: Config resolution order

The config system SHALL resolve settings in this order, with later sources overriding earlier ones:
1. Hardcoded defaults
2. Global config (`~/.pi/agent/supi/config.json`)
3. Project config (`.pi/supi/config.json`)

#### Scenario: Full resolution chain

- **WHEN** hardcoded default is `rereadInterval: 3`, global sets `rereadInterval: 5`, and project sets `rereadInterval: 10`
- **THEN** the resolved value SHALL be `10`

#### Scenario: No overrides

- **WHEN** neither global nor project config exists
- **THEN** all values SHALL be hardcoded defaults

### Requirement: Load config API

The `supi-core` package SHALL export a `loadSupiConfig<T>(section: string, cwd: string, defaults: T): T` function that loads and merges config for a given extension section. The function SHALL perform a shallow merge of each layer on top of defaults.

#### Scenario: Extension loads its config

- **WHEN** an extension calls `loadSupiConfig("claude-md", cwd, { rereadInterval: 3, subdirs: true })`
- **THEN** it SHALL receive the merged result of defaults ← global ← project for the `"claude-md"` section

### Requirement: Write config API

The `supi-core` package SHALL export a `writeSupiConfig(section: string, scope: "global" | "project", cwd: string, value: Record<string, unknown>): void` function. It SHALL read the existing config file, merge the new values into the specified section, and write the result back. It SHALL create the directory and file if they do not exist.

#### Scenario: Write to project config

- **WHEN** an extension calls `writeSupiConfig("claude-md", "project", cwd, { rereadInterval: 5 })`
- **THEN** `.pi/supi/config.json` SHALL contain `{ "claude-md": { "rereadInterval": 5 } }` (merged with any existing content)

#### Scenario: Write to global config

- **WHEN** an extension calls `writeSupiConfig("claude-md", "global", cwd, { rereadInterval: 5 })`
- **THEN** `~/.pi/agent/supi/config.json` SHALL be updated with the new value in the `"claude-md"` section

#### Scenario: Config file created if missing

- **WHEN** the target config file and directory do not exist
- **THEN** the directory and file SHALL be created with the new content

### Requirement: Command writes to project config by default

The `/supi-claude-md` command SHALL write config changes to project config (`.pi/supi/config.json`) by default. When the `--global` flag is provided, it SHALL write to global config instead.

#### Scenario: Command writes project config

- **WHEN** user runs `/supi-claude-md interval 5`
- **THEN** `.pi/supi/config.json` SHALL be updated with `{ "claude-md": { "rereadInterval": 5 } }`

#### Scenario: Command writes global config

- **WHEN** user runs `/supi-claude-md --global interval 5`
- **THEN** `~/.pi/agent/supi/config.json` SHALL be updated with `{ "claude-md": { "rereadInterval": 5 } }`

### Requirement: Command subcommands

The `/supi-claude-md` command SHALL support these subcommands:
- (no args) or `status`: show effective config and current state
- `refresh`: force re-inject on next prompt
- `list`: show discovered subdirectory context files
- `interval <N>`: set reread interval
- `interval off`: disable periodic reread (set to 0)
- `interval default`: remove project override for interval
- `subdirs on|off`: toggle subdirectory discovery
- `compact on|off`: toggle post-compaction refresh
- `--global` flag: write to global config instead of project

#### Scenario: Status shows effective config

- **WHEN** user runs `/supi-claude-md status`
- **THEN** the extension SHALL display the resolved config values, completed turns, last refresh turn, and number of injected subdirectories

#### Scenario: Interval set

- **WHEN** user runs `/supi-claude-md interval 5`
- **THEN** the reread interval SHALL be updated to 5 in project config and take effect immediately

#### Scenario: Interval default removes override

- **WHEN** user runs `/supi-claude-md interval default`
- **THEN** the `rereadInterval` key SHALL be removed from project config, falling back to global or hardcoded default
