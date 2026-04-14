## ADDED Requirements

### Requirement: Enabled plugin commands SHALL be exposed as namespaced prompt commands
The system SHALL materialize generated prompt wrappers for enabled plugin commands and publish them to pi through `resources_discover`, using the namespace format `/plugin-id:command-name`.

#### Scenario: Command wrappers are generated for an enabled plugin
- **WHEN** an enabled plugin provides `commands/review.md`
- **THEN** pi exposes a generated prompt command named `/plugin-id:review` whose content delegates to that plugin command file

#### Scenario: Command name collisions are avoided across plugins
- **WHEN** two enabled plugins both provide a command named `review`
- **THEN** each command remains invokable through its own namespaced command without overwriting the other

### Requirement: Enabled plugin skills SHALL be exposed through collision-safe v1 wrappers
The system SHALL expose enabled plugin skills through generated wrappers using the namespace format `/plugin-id:skill:skill-name` rather than relying on native pi skill discovery.

#### Scenario: Plugin skill becomes invokable in pi
- **WHEN** an enabled plugin provides `skills/refactor/SKILL.md`
- **THEN** pi exposes a generated prompt command named `/plugin-id:skill:refactor` that loads the plugin skill guidance

#### Scenario: Command and skill names do not collide
- **WHEN** the same plugin provides both a command named `review` and a skill named `review`
- **THEN** pi exposes `/plugin-id:review` for the command and `/plugin-id:skill:review` for the skill as separate invocations

### Requirement: Skill wrappers SHALL preserve progressive-disclosure guidance
The system SHALL generate skill wrappers that preserve the plugin skill description and direct the agent to read the original plugin `SKILL.md` and referenced `references/` files on demand instead of inlining the full skill tree into the wrapper.

#### Scenario: Skill wrapper preserves source skill entrypoint
- **WHEN** a user invokes `/plugin-id:skill:refactor`
- **THEN** the generated wrapper identifies the original plugin `SKILL.md` path and instructs the agent to load that file for the full workflow guidance

#### Scenario: Referenced skill docs remain loadable on demand
- **WHEN** the plugin skill references `references/example.md`
- **THEN** the generated wrapper preserves a path that allows the agent to read that referenced file separately when needed

### Requirement: Resource discovery SHALL rebuild generated wrappers on startup and reload
The system SHALL regenerate the published wrapper directory whenever marketplace resources are rediscovered, and SHALL remove wrappers for plugins or resources that are no longer enabled.

#### Scenario: Reload removes wrappers for a disabled plugin
- **WHEN** a plugin was previously enabled, then becomes disabled before `/reload`
- **THEN** the regenerated wrapper set no longer publishes that plugin's commands or skill wrappers

#### Scenario: Wrapper content updates after plugin changes
- **WHEN** a plugin command file changes and pi performs resource discovery again
- **THEN** the regenerated wrapper reflects the updated plugin content for subsequent invocations

#### Scenario: Startup and reload both republish wrapper paths
- **WHEN** pi performs `resources_discover` on startup or `/reload`
- **THEN** the marketplace extension republishes the generated wrapper directory so the updated commands remain visible in the current session
