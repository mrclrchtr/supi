## ADDED Requirements

### Requirement: Settings overlay command
The system SHALL provide a `settings` subcommand for `/supi-claude-md` that opens an interactive configuration overlay.

#### Scenario: Opening the settings UI
- **WHEN** the user runs `/supi-claude-md settings`
- **THEN** an overlay appears showing the current effective configuration for `rereadInterval`, `subdirs`, and `fileNames`

#### Scenario: Dismissing the settings UI
- **WHEN** the user presses Escape inside the settings overlay
- **THEN** the overlay closes and control returns to the normal chat input

### Requirement: Scope selection
The settings overlay SHALL allow the user to switch between Project scope and Global scope.

#### Scenario: Default scope is Project
- **WHEN** the settings overlay opens
- **THEN** the initial scope is Project and values reflect the project-level `claude-md` config (or defaults if absent)

#### Scenario: Switching to Global scope
- **WHEN** the user switches the scope to Global
- **THEN** the displayed values update to reflect the global-level `claude-md` config (or defaults if absent)

#### Scenario: Persisting in selected scope
- **WHEN** the user changes a setting while Global scope is active
- **THEN** the change is written to the global config file

### Requirement: Boolean toggle editing
The overlay SHALL provide toggle controls for `subdirs`.

#### Scenario: Toggling subdirs on
- **WHEN** the user toggles `subdirs` from off to on in the overlay
- **THEN** the value `true` is persisted to the selected scope's config

### Requirement: Numeric interval editing
The overlay SHALL provide an editable field for `rereadInterval`.

#### Scenario: Setting interval to a positive number
- **WHEN** the user edits `rereadInterval` to `5` and confirms
- **THEN** the value `5` is persisted as a number to the selected scope's config

#### Scenario: Setting interval to off
- **WHEN** the user edits `rereadInterval` to `0` or selects an "off" option
- **THEN** the value `0` is persisted, disabling periodic root refresh

#### Scenario: Resetting interval to default
- **WHEN** the user resets `rereadInterval` to default
- **THEN** the config key is removed from the selected scope's config, causing the default value (`3`) to take effect

### Requirement: File names display
The overlay SHALL display the current `fileNames` list as read-only information.

#### Scenario: Viewing fileNames
- **WHEN** the settings overlay is open
- **THEN** the current `fileNames` array is shown as a comma-separated string

### Requirement: Immediate persistence
All changes made in the settings overlay SHALL be persisted immediately upon user confirmation.

#### Scenario: Immediate write after toggle
- **WHEN** the user toggles a boolean setting
- **THEN** the config file for the selected scope is updated before the overlay renders the next frame
