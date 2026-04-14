## ADDED Requirements

### Requirement: Claude plugin discovery and manifest parsing
The system SHALL discover Claude plugins from supported user, project, and local scope locations, parse each `.claude-plugin/plugin.json`, and normalize the result into a registry record that includes plugin id, source path, scope, manifest metadata, compatibility status, and discovered component paths.

#### Scenario: User-scoped plugin with multiple components is discovered
- **WHEN** a user-scoped Claude plugin contains `.claude-plugin/plugin.json` plus `commands/`, `skills/`, `agents/`, `hooks/hooks.json`, and `bin/`
- **THEN** the registry records the plugin once with its discovered component inventory and source scope `user`

#### Scenario: Malformed manifest is skipped safely
- **WHEN** a candidate plugin directory contains an unreadable or invalid `.claude-plugin/plugin.json`
- **THEN** the registry excludes that plugin from activation and reports the discovery failure in status output or logs without crashing the extension

### Requirement: Registry compatibility checks SHALL validate the supported Claude plugin layout
The system SHALL validate discovered plugins against the supported v1 Claude plugin layout centered on `.claude-plugin/plugin.json` with optional `commands/`, `skills/`, `agents/`, `hooks/hooks.json`, and `bin/` directories.

#### Scenario: Supported plugin layout is marked compatible
- **WHEN** a discovered plugin matches the supported v1 layout
- **THEN** the registry marks the plugin as compatible and eligible for downstream activation

#### Scenario: Unsupported plugin layout is skipped clearly
- **WHEN** a discovered plugin uses an unsupported or incomplete layout
- **THEN** the registry marks the plugin as incompatible, skips activation, and surfaces the compatibility reason in status output

### Requirement: Effective enablement SHALL be resolved for the current working directory
The system SHALL combine discovered plugin records with Claude enablement metadata from `installed_plugins.json`, `~/.claude/settings.json`, `.claude/settings.json`, and `.claude/settings.local.json`, and resolve whether each plugin is active for the current cwd, applying more specific scopes before less specific scopes.

#### Scenario: Project setting disables a globally enabled plugin
- **WHEN** a plugin is enabled in user scope but disabled for the current project in a more specific settings source
- **THEN** the effective plugin state for that cwd is disabled

#### Scenario: Project-scoped plugin only applies inside its project
- **WHEN** a plugin is enabled for one project directory but pi is started in a different unrelated cwd
- **THEN** the registry does not mark that project-scoped plugin as enabled for the unrelated cwd

#### Scenario: Local override wins over project and user settings
- **WHEN** a plugin is enabled in `~/.claude/settings.json` and `.claude/settings.json` but disabled in `.claude/settings.local.json` for the current cwd
- **THEN** the effective plugin state for that cwd is disabled

### Requirement: The registry SHALL expose component and status summaries
The system SHALL provide a summary view of discovered plugins that includes effective enablement, scope, compatibility status, component counts, and reasons when a plugin is unavailable or inactive.

#### Scenario: Status command reports enabled and disabled plugins
- **WHEN** the user runs the marketplace status command in a project with both enabled and disabled plugins
- **THEN** the output lists each plugin's scope, enabled state, discovered components, and any disablement or discovery reason
