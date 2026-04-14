## ADDED Requirements

### Requirement: Enabled plugin command hooks SHALL be discovered from hook manifests
The system SHALL load `hooks/hooks.json` from enabled plugins and activate only hook entries with `type: "command"` for supported event mappings.

#### Scenario: Supported command hooks are loaded
- **WHEN** an enabled plugin defines command hooks for supported lifecycle or tool events in `hooks/hooks.json`
- **THEN** those hook definitions become part of the active hook registry for the current cwd

#### Scenario: Unsupported hook types are ignored safely
- **WHEN** a plugin hook manifest includes unsupported entries such as `http`, `prompt`, or `agent`
- **THEN** those entries are skipped and reported as unsupported without failing the extension

### Requirement: Supported pi events SHALL trigger matching plugin hooks with structured context
The system SHALL map Claude hook events to pi events as follows: `SessionStart` → `session_start`, `SessionEnd` → `session_shutdown`, `UserPromptSubmit` → `input`, `PreToolUse` → `tool_call`, `PostToolUse` → successful `tool_result`, `PostToolUseFailure` → failing `tool_result`, and `Stop` → `agent_end`. The system SHALL run matching command hooks for those mapped pi events and provide structured execution context that includes the plugin id, cwd, event name, and event-specific data.

#### Scenario: Pre-tool hook receives tool context
- **WHEN** a mapped pre-tool event fires for a `bash` tool call
- **THEN** the hook command receives context identifying the plugin, cwd, hook event, tool name, and tool arguments

#### Scenario: Post-tool-failure hook receives failure details
- **WHEN** a mapped post-tool-failure event fires after a tool returns an error
- **THEN** the hook command receives context describing the failing tool and the error result

#### Scenario: Session start hook fires from pi lifecycle
- **WHEN** pi emits `session_start`
- **THEN** any active `SessionStart` command hooks execute with context describing the session start event

### Requirement: Hook failures SHALL be contained safely
The system SHALL prevent hook execution failures from crashing the marketplace bridge, and SHALL only block the current operation for blocking pre-execution hook events.

#### Scenario: Failing pre-tool hook blocks the tool call
- **WHEN** a pre-tool command hook exits non-zero for a blocking event
- **THEN** the corresponding tool call is blocked and the user receives the hook failure reason

#### Scenario: Failing post-event hook does not stop the session
- **WHEN** a post-tool or session hook exits non-zero
- **THEN** the failure is surfaced in logs or status output while the pi session continues running
