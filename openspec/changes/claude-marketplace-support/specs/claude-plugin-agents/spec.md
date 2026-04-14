## ADDED Requirements

### Requirement: Enabled plugin agents SHALL be discovered and validated
The system SHALL discover agent definitions from enabled plugins, parse their markdown frontmatter, and register only agents that satisfy the supported v1 schema.

#### Scenario: Valid plugin agent is registered under a namespace
- **WHEN** an enabled plugin provides `agents/reviewer.md` with supported frontmatter and prompt content
- **THEN** the agent is registered internally as `plugin-id:reviewer`

#### Scenario: Unsupported agent definition is rejected clearly
- **WHEN** a plugin agent requires an unsupported v1 mode such as background execution
- **THEN** the bridge does not register that agent and reports the reason through status output or tool errors

### Requirement: Plugin agents SHALL execute through an isolated subprocess runtime
The system SHALL register a `claude_plugin_agent` tool that executes a selected namespaced plugin agent in a separate pi subprocess and returns the final agent output to the caller.

#### Scenario: Successful plugin agent run
- **WHEN** the agent tool is called with `agent: "plugin-id:reviewer"` and a task prompt
- **THEN** the bridge launches a subprocess-based agent run, streams progress updates, and returns the final result from that plugin agent

#### Scenario: Unknown agent name returns a clear error
- **WHEN** the tool is called with an agent name that is not currently registered
- **THEN** the tool returns an error explaining that the requested plugin agent is unavailable

### Requirement: Plugin agent execution SHALL enforce supported policy fields
The system SHALL honor supported frontmatter controls such as allowed tools, disallowed tools, model selection, and max turns when launching a plugin agent.

#### Scenario: Disallowed tools are removed from the agent runtime
- **WHEN** a plugin agent frontmatter disallows `bash`
- **THEN** the launched subprocess agent does not receive `bash` as an available tool

#### Scenario: Max turns limit is enforced
- **WHEN** a plugin agent declares `maxTurns: 3`
- **THEN** the subprocess agent run stops after at most three turns of model execution
