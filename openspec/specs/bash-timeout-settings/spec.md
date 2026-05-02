## Purpose

SuPi bash-timeout extension default timeout configuration, exposed through the SuPi settings registry.

## Requirements

### Requirement: Default timeout is configurable via SuPi settings
The `bash-timeout` extension SHALL read its default timeout value from the SuPi config system under the `bash-timeout` section.

#### Scenario: Load default value
- **WHEN** the `bash-timeout` extension loads its configuration
- **AND** no value is configured in either global or project scope
- **THEN** the default timeout SHALL be 120 seconds

#### Scenario: Load configured global value
- **WHEN** the user has set `bash-timeout.defaultTimeout` to 300 in global config
- **THEN** the extension SHALL use 300 seconds as the default timeout

#### Scenario: Load configured project value
- **WHEN** the user has set `bash-timeout.defaultTimeout` to 60 in project config
- **THEN** the extension SHALL use 60 seconds as the default timeout

### Requirement: Default timeout appears in /supi-settings
The `bash-timeout` extension SHALL register a settings section that appears in the `/supi-settings` TUI overlay.

#### Scenario: Settings overlay lists bash-timeout section
- **WHEN** the user opens `/supi-settings`
- **THEN** a "Bash Timeout" section SHALL be visible
- **AND** it SHALL display the current `defaultTimeout` value

#### Scenario: Change timeout via settings overlay
- **WHEN** the user selects the "Default Timeout" setting in the bash-timeout section
- **AND** enters a new numeric value
- **THEN** the value SHALL be persisted to the currently selected scope (global or project)
- **AND** subsequent bash tool calls SHALL use the new timeout

### Requirement: Invalid timeout values are rejected
The extension SHALL reject non-positive or non-numeric timeout values and fall back to the default.

#### Scenario: Invalid string input
- **WHEN** the persisted config contains a non-numeric `defaultTimeout` value
- **THEN** the extension SHALL fall back to 120 seconds

#### Scenario: Zero or negative input
- **WHEN** the persisted config contains a `defaultTimeout` of 0 or a negative number
- **THEN** the extension SHALL fall back to 120 seconds
