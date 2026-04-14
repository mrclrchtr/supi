## ADDED Requirements

### Requirement: Marketplace status command SHALL summarize active bridge state
The system SHALL provide a `/claude-marketplace-status` command that reports discovered plugins, effective enabled state, scope, compatibility status, discovered component counts, generated wrapper counts, active plugin agents, hook counts, and injected `bin/` paths for the current cwd.

#### Scenario: Status command reports active bridge state
- **WHEN** the user runs `/claude-marketplace-status` in a project with compatible enabled plugins
- **THEN** the output summarizes each plugin's scope, enabled state, compatibility, component inventory, wrapper counts, hook counts, available agents, and active `bin/` path contribution

#### Scenario: Status command reports empty state clearly
- **WHEN** the user runs `/claude-marketplace-status` in a cwd with no discovered or enabled Claude plugins
- **THEN** the output states that no compatible enabled plugins are active for the current cwd

### Requirement: Status output SHALL surface discovery and compatibility failures
The system SHALL include plugin discovery, manifest parsing, settings resolution, and compatibility errors in status output without crashing the command.

#### Scenario: Incompatible plugin appears with reason
- **WHEN** a discovered plugin fails layout compatibility validation
- **THEN** the status output lists that plugin as incompatible and includes the failure reason

#### Scenario: Partial discovery failure does not hide healthy plugins
- **WHEN** one plugin fails discovery or settings resolution while another plugin succeeds
- **THEN** the status command still reports the healthy plugin and separately reports the failing plugin's error state
