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

### Requirement: Settings UI via `/supi-settings`

Claude-md settings SHALL be managed through the unified `/supi-settings` command provided by `supi-core`. The extension SHALL register its settings with the `supi-core` settings registry so they appear in the shared settings overlay.

#### Scenario: User opens settings UI

- **WHEN** the user runs `/supi-settings`
- **THEN** the settings UI SHALL show the `claude-md` section with its current effective config values

#### Scenario: Settings write to project config

- **WHEN** the user changes a setting in the `/supi-settings` UI with project scope active
- **THEN** `.pi/supi/config.json` SHALL be updated with the new value in the `"claude-md"` section

#### Scenario: Settings write to global config

- **WHEN** the user changes a setting in the `/supi-settings` UI with global scope active
- **THEN** `~/.pi/agent/supi/config.json` SHALL be updated with the new value in the `"claude-md"` section
