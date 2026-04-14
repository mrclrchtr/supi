## ADDED Requirements

### Requirement: Enabled plugin bin directories SHALL be injected into bash execution environments
The system SHALL prepend `bin/` directories from enabled plugins to PATH for both agent `bash` tool calls and interactive `user_bash` commands.

#### Scenario: Agent bash call can execute a plugin-provided binary
- **WHEN** an enabled plugin ships `bin/my-helper` and the agent runs a bash command that references `my-helper`
- **THEN** the command resolves successfully without requiring an absolute plugin path

#### Scenario: User bash call receives the same PATH injection
- **WHEN** the user runs a `!my-helper` command in pi
- **THEN** the plugin binary is available through the injected PATH in the same cwd

### Requirement: Bin injection SHALL be scope-aware and deterministic
The system SHALL include only `bin/` directories from plugins that are enabled for the current cwd, ordered by scope specificity and then by plugin id.

#### Scenario: Project-only bin path does not leak outside the project
- **WHEN** a plugin is enabled only for one project and pi runs in another unrelated cwd
- **THEN** that plugin's `bin/` directory is not added to PATH

#### Scenario: Multiple plugin bin paths have stable ordering
- **WHEN** several enabled plugins provide `bin/` directories for the same cwd
- **THEN** PATH is constructed in deterministic order using scope specificity first and plugin id as the tie-breaker

### Requirement: Active bin injections SHALL be visible to the user
The system SHALL report the currently injected plugin `bin/` paths in marketplace status output.

#### Scenario: Status command lists active bin paths
- **WHEN** the user runs the marketplace status command in a cwd with enabled plugin binaries
- **THEN** the output includes the contributing plugin ids and the `bin/` paths currently prepended to PATH
