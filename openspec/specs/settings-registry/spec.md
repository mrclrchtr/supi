# Capability: settings-registry

## Purpose
Shared module-level registry where supi extensions declare their settings sections, and a generic TUI overlay that renders all registered sections via pi-tui's SettingsList component.

## Requirements

### Requirement: Settings registration API
The system SHALL provide a `registerSettings(section)` function in supi-core that accepts a settings section containing an extension id, label, an array of setting items compatible with pi-tui's `SettingItem`, and callbacks for loading current values and persisting changes.

#### Scenario: Extension registers settings during startup
- **WHEN** an extension calls `registerSettings({ id: "lsp", label: "LSP", settings: [...], loadValues, persistChange })` during its factory function
- **THEN** the section is stored in the registry and available to `getRegisteredSettings()`

#### Scenario: Extension registers with duplicate id
- **WHEN** an extension calls `registerSettings()` with an id that is already registered
- **THEN** the new registration replaces the previous one

### Requirement: Settings retrieval
The system SHALL provide a `getRegisteredSettings()` function that returns all registered settings sections in registration order.

#### Scenario: Multiple extensions registered
- **WHEN** supi-lsp and supi-claude-md have both called `registerSettings()`
- **THEN** `getRegisteredSettings()` returns an array containing both sections

#### Scenario: No extensions registered
- **WHEN** no extension has called `registerSettings()`
- **THEN** `getRegisteredSettings()` returns an empty array

### Requirement: Unified settings command
The system SHALL register a `/supi-settings` command that opens an interactive settings overlay displaying all registered settings sections.

#### Scenario: User opens settings with extensions registered
- **WHEN** the user invokes `/supi-settings` and at least one extension has registered settings
- **THEN** the system opens a TUI overlay showing all registered settings grouped by extension, with navigation, value cycling, and search

#### Scenario: User opens settings with no extensions registered
- **WHEN** the user invokes `/supi-settings` and no extension has registered settings
- **THEN** the system shows a notification indicating no settings are available

### Requirement: Scope toggle
The settings overlay SHALL support toggling between project and global scope via the Tab key. The active scope determines where setting changes are persisted.

#### Scenario: User toggles scope
- **WHEN** the user presses Tab in the settings overlay
- **THEN** the scope indicator toggles between "Project" and "Global" and all displayed values reload for the new scope

#### Scenario: User edits a setting in project scope
- **WHEN** the user changes a setting value while scope is "Project"
- **THEN** the system persists the change to `.pi/supi/config.json` under the extension's section

#### Scenario: User edits a setting in global scope
- **WHEN** the user changes a setting value while scope is "Global"
- **THEN** the system persists the change to `~/.pi/agent/supi/config.json` under the extension's section

### Requirement: Setting value cycling
For settings with a `values` array, the overlay SHALL cycle through values on Enter/Space, immediately persisting the selected value.

#### Scenario: Boolean toggle
- **WHEN** a setting has `values: ["on", "off"]` and current value "on" and the user activates it
- **THEN** the value cycles to "off" and the change is persisted

### Requirement: String-based value representation
The registry and UI SHALL work entirely in strings. Each extension's `loadValues` callback SHALL convert typed config values to display strings. Each extension's `persistChange` callback SHALL parse strings back to typed values before writing to config.

#### Scenario: Boolean config value displayed as string
- **WHEN** an extension's config has `enabled: true` (boolean)
- **THEN** `loadValues` returns `currentValue: "on"` for the corresponding setting item

#### Scenario: String value persisted as typed config
- **WHEN** the user sets a value to "off" via the UI and the extension's setting is boolean
- **THEN** `persistChange` converts "off" to `false` before writing to config

### Requirement: Setting submenu
For settings with a `submenu` callback, the overlay SHALL open a child component on Enter/Space, allowing nested editing. The submenu receives the current value and a done callback.

#### Scenario: Opening a submenu
- **WHEN** a setting defines a `submenu` callback and the user activates it
- **THEN** the overlay transitions to the submenu component returned by the callback

#### Scenario: Closing a submenu
- **WHEN** the user presses Escape in a submenu
- **THEN** the overlay returns to the main settings list

### Requirement: Setting descriptions
Each setting item MAY include a description that is displayed when the item is selected.

#### Scenario: Selected item with description
- **WHEN** a setting has `description: "Controls inline diagnostic threshold"` and the item is selected
- **THEN** the description is displayed below the setting row

### Requirement: Search filtering
The settings overlay SHALL support fuzzy search by label to filter displayed settings.

#### Scenario: User types a search term
- **WHEN** the user types "severity" in the search input
- **THEN** only settings whose labels match "severity" are displayed

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
