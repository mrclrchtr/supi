## ADDED Requirements

### Requirement: Config-backed settings helper
The system SHALL provide a helper in `supi-core` for SuPi config-backed settings sections that wraps the existing settings registry contract. The helper SHALL load settings UI values from the selected scope only (`defaults <- selected scope`) instead of merged effective runtime config.

#### Scenario: Global scope displays raw global values
- **WHEN** a config-backed section is registered with the helper, the project config overrides `enabled` to `true`, the global config sets `enabled` to `false`, and the settings UI requests values for scope `global`
- **THEN** the helper returns items built from config where `enabled` is `false`
- **AND** the project override does not affect the displayed global value

#### Scenario: Project scope displays raw project values
- **WHEN** a config-backed section is registered with the helper, the global config sets `severity` to `2`, the project config sets `severity` to `4`, and the settings UI requests values for scope `project`
- **THEN** the helper returns items built from config where `severity` is `4`
- **AND** the global value does not replace the displayed project value

### Requirement: Config-backed helper provides scoped persistence helpers
The config-backed settings helper SHALL provide persistence helpers that write only to the active scope's SuPi config section.

#### Scenario: Project-scope write stays in project config
- **WHEN** a config-backed section uses the helper and persists a change while scope is `project`
- **THEN** the helper writes the change to `.pi/supi/config.json` under that section
- **AND** the helper does not modify `~/.pi/agent/supi/config.json`

#### Scenario: Global-scope unset removes only global override
- **WHEN** a config-backed section uses the helper and unsets a setting while scope is `global`
- **THEN** the helper removes that key from `~/.pi/agent/supi/config.json` under that section
- **AND** the helper does not remove or rewrite the project-scoped value

### Requirement: Generic settings registration remains available
The system SHALL keep the existing generic `registerSettings(section)` API available for settings sections that do not want SuPi-config-backed helper behavior.

#### Scenario: Existing generic sections still register directly
- **WHEN** an extension registers a section with `registerSettings()` instead of the config-backed helper
- **THEN** the section is stored in the registry and returned by `getRegisteredSettings()` unchanged
