## MODIFIED Requirements

### Requirement: Settings retrieval
The system SHALL provide a `getRegisteredSettings()` function that returns all registered settings sections in registration order. The unified settings overlay SHALL namespace item ids with their section id to prevent collision across extensions.

#### Scenario: Two extensions with same item id
- **WHEN** supi-lsp registers `id: "enabled"` and another extension also registers `id: "enabled"`
- **THEN** the settings overlay treats them as distinct items (`lsp.enabled` and `other.enabled`) and routes changes to the correct extension

## ADDED Requirements

### Requirement: Settings command on root install surface
The repository root `package.json` SHALL include the settings extension in its `pi.extensions` array so that local-path and git installs register the `/supi-settings` command.

#### Scenario: Local-path install from repo root
- **WHEN** pi is launched with the repository root as an extension source
- **THEN** the `/supi-settings` command is available
