# Capability: claude-md-settings-ui

## Purpose
Expose Claude-MD configuration through the shared `/supi-settings` UI with scope-aware editing and immediate persistence.

## Requirements

### Requirement: Claude-MD settings in shared SuPi settings UI
The system SHALL expose Claude-MD configuration inside the shared `/supi-settings` overlay.

#### Scenario: Opening the settings UI
- **WHEN** the user runs `/supi-settings`
- **THEN** an overlay appears
- **AND** it includes a Claude-MD settings section showing `rereadInterval`, `contextThreshold`, `subdirs`, and `fileNames`

#### Scenario: Dismissing the settings UI
- **WHEN** the user presses Escape inside the settings overlay
- **THEN** the overlay closes and control returns to the normal chat input

### Requirement: Scope selection
The shared settings overlay SHALL allow the user to switch Claude-MD settings between Project scope and Global scope.

#### Scenario: Default scope is Project
- **WHEN** the settings overlay opens
- **THEN** the initial scope is Project
- **AND** Claude-MD values reflect the project-level config for that scope (or defaults if absent)

#### Scenario: Switching to Global scope
- **WHEN** the user switches the shared settings overlay to Global scope
- **THEN** the displayed Claude-MD values update to reflect the global-level config (or defaults if absent)

#### Scenario: Persisting in selected scope
- **WHEN** the user changes a Claude-MD setting while Global scope is active
- **THEN** the change is written to the global config file

### Requirement: Boolean toggle editing
The Claude-MD settings section SHALL provide toggle controls for `subdirs`.

#### Scenario: Toggling subdirs on
- **WHEN** the user toggles `subdirs` from off to on in the overlay
- **THEN** the value `true` is persisted to the selected scope's config

#### Scenario: Toggling subdirs off
- **WHEN** the user toggles `subdirs` from on to off in the overlay
- **THEN** the value `false` is persisted to the selected scope's config

### Requirement: Numeric interval editing
The Claude-MD settings section SHALL provide a text-input editor for `rereadInterval`. The setting SHALL control the interval for re-reading previously injected subdirectory context only. It SHALL NOT enable periodic root/native context refresh.

#### Scenario: Setting interval to a positive number
- **WHEN** the user edits `rereadInterval` to `5` and confirms
- **THEN** the value `5` is persisted as a number to the selected scope's config
- **AND** previously injected subdirectory context becomes eligible for re-injection after 5 completed assistant turns

#### Scenario: Setting interval to off
- **WHEN** the user edits `rereadInterval` to `0` and confirms
- **THEN** the value `0` is persisted to the selected scope's config
- **AND** periodic subdirectory re-read behavior is disabled
- **AND** root/native context refresh remains disabled regardless of this value

#### Scenario: Settings copy describes subdirectory re-read
- **WHEN** the user views the `rereadInterval` setting in `/supi-settings`
- **THEN** its label or description SHALL NOT describe root refresh
- **AND** it SHALL describe re-reading previously injected context or subdirectory context

### Requirement: Context threshold editing
The Claude-MD settings section SHALL allow editing `contextThreshold`.

#### Scenario: Setting threshold to 90
- **WHEN** the user changes `contextThreshold` to `90`
- **THEN** the value `90` is persisted to the selected scope's config

### Requirement: File names editing
The Claude-MD settings section SHALL display and allow editing the current `fileNames` list as comma-separated text.

#### Scenario: Viewing fileNames
- **WHEN** the settings overlay is open
- **THEN** the current `fileNames` array is shown as a comma-separated string

#### Scenario: Editing fileNames
- **WHEN** the user edits `fileNames` to `CLAUDE.md, AGENTS.md, NOTES.md` and confirms
- **THEN** the value is persisted as `[
  "CLAUDE.md",
  "AGENTS.md",
  "NOTES.md"
]` in the selected scope's config

#### Scenario: Clearing fileNames
- **WHEN** the user clears the `fileNames` input and confirms
- **THEN** the scoped `fileNames` config key is removed
- **AND** the default file-name list takes effect again

### Requirement: Immediate persistence
All changes made in the shared settings overlay SHALL be persisted immediately upon user confirmation.

#### Scenario: Immediate write after toggle
- **WHEN** the user toggles a Claude-MD boolean setting
- **THEN** the config file for the selected scope is updated before the overlay renders the next frame
