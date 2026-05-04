## ADDED Requirements

### Requirement: Reviewer runs via createAgentSession with in-memory session
The reviewer SHALL run as an in-process managed child session via `createAgentSession()` with `SessionManager.inMemory()`. The extension SHALL:

1. Register a `submit_review` custom tool on the session via the `customTools` option, using the same TypeBox schema as the current `ReviewOutputEvent`. The tool's `execute` handler stores the validated result in a closure variable, then returns with `terminate: true`.
2. Set the session's active tools to `["read", "grep", "find", "ls"]` via the `tools` option.
3. Suppress extensions, themes, skills, prompt templates, and context files by constructing a `DefaultResourceLoader` with `noExtensions: true`, `noSkills: true`, `noPromptTemplates: true`, `noThemes: true`, `noContextFiles: true`, and `appendSystemPrompt: [REVIEW_PROMPT]`.
4. Resolve the model string from settings or the parent session into a `Model<any>` object via `ModelRegistry.find()`, and pass it to `createAgentSession()` via the `model` option.
5. Call `session.prompt(reviewPrompt)` to start the review, subscribe to session events via `session.subscribe()`, and await the `agent_end` event to detect completion.

#### Scenario: Reviewer calls submit_review successfully
- **WHEN** the reviewer session calls `submit_review` with valid arguments
- **THEN** the tool stores the `ReviewOutputEvent` in the closure variable and sets `terminate: true`
- **AND** the agent emits `agent_end` after the tool batch finishes
- **AND** the parent reads the stored result and returns it as a `ReviewResult` with `kind: "success"`

#### Scenario: Reviewer calls submit_review with invalid arguments
- **WHEN** the reviewer session calls `submit_review` with malformed arguments
- **THEN** pi's TypeBox validation returns a validation error to the model
- **AND** the model can retry with corrected arguments

#### Scenario: Reviewer finishes without calling submit_review
- **WHEN** the reviewer session emits `agent_end` without calling `submit_review`
- **THEN** the parent extracts the final assistant message text from `session.messages`
- **AND** returns a `ReviewResult` with `kind: "failed"` and reason indicating no structured output

#### Scenario: Session creation fails
- **WHEN** `createAgentSession()` throws an error (e.g., model unavailable, invalid auth)
- **THEN** the extension SHALL catch the error and return a `ReviewResult` with `kind: "failed"` containing the error message

### Requirement: Live progress widget shows reviewer activity
During review execution, the extension SHALL display a progress widget above the editor showing:

- An animated spinner indicating the review is running
- The current turn count (e.g., `⟳3`)
- The number of tool uses so far
- Human-readable descriptions of active tools (e.g., "reading, searching…")
- Token usage when available from session stats

The widget SHALL update via the session's `subscribe()` event stream, reacting to `tool_execution_start`, `tool_execution_end`, and `turn_end` events. Token counts MAY be updated after each `turn_end` by reading `session.getSessionStats()`.

#### Scenario: Reviewer starts reading files
- **WHEN** the reviewer begins a `read` tool execution
- **THEN** the widget shows "reading" in the activity description

#### Scenario: Reviewer searches with grep
- **WHEN** the reviewer begins a `grep` tool execution
- **THEN** the widget shows "searching" in the activity description

#### Scenario: Reviewer completes a turn
- **WHEN** the reviewer finishes an agentic turn
- **THEN** the widget increments the displayed turn count
- **AND** the widget continues showing the spinner

#### Scenario: Review completes
- **WHEN** the reviewer session emits `agent_end`
- **THEN** the widget is cleared from the editor

### Requirement: Graceful timeout via steering
The review SHALL support a configurable timeout. When the timeout is reached:

1. The parent SHALL call `session.steer("Time limit reached. Wrap up and submit your review now.")` to give the reviewer a chance to produce a final result.
2. The reviewer gets a fixed grace period of 3 additional turns to call `submit_review`.
3. If the reviewer does not emit `agent_end` within the grace turns, the parent SHALL call `session.abort()`, wait for the session to idle, and return a `ReviewResult` with `kind: "timeout"` and the final assistant text as `partialOutput`.

#### Scenario: Reviewer finishes within grace turns
- **WHEN** the timeout fires and the reviewer receives a steering message
- **AND** the reviewer calls `submit_review` within 3 additional turns
- **THEN** the result is returned normally with `kind: "success"`

#### Scenario: Reviewer exceeds grace turns
- **WHEN** the timeout fires and the reviewer exceeds 3 grace turns without calling `submit_review`
- **THEN** the parent calls `session.abort()` and awaits the session to become idle
- **AND** returns a `ReviewResult` with `kind: "timeout"` and the final assistant text as `partialOutput`

### Requirement: Cancellation via session.abort
When the review is canceled (user presses Escape or abort signal fires), the extension SHALL call `session.abort()` to immediately stop the reviewer. The result SHALL be a `ReviewResult` with `kind: "canceled"`.

#### Scenario: User cancels review
- **WHEN** the user presses Escape on the progress widget
- **THEN** the abort signal fires
- **AND** `session.abort()` stops the reviewer session
- **AND** the extension returns `kind: "canceled"`

#### Scenario: Review is already complete when cancel fires
- **WHEN** the abort signal fires but the reviewer has already emitted `agent_end`
- **THEN** the completed result is returned instead of `canceled`

## MODIFIED Requirements

### Requirement: Structured review output is parsed
The extension SHALL obtain the review result from the `ReviewOutputEvent` stored by the `submit_review` custom tool. Because the `submit_review` tool uses a TypeBox schema, pi's AJV validation guarantees the JSON is structurally valid before the tool's execute handler is called.

The `ReviewOutputEvent` schema SHALL be:
```json
{
  "findings": [
    {
      "title": "<string>",
      "body": "<markdown string>",
      "confidence_score": 0.0,
      "priority": 2,
      "code_location": {
        "absolute_file_path": "<absolute path>",
        "line_range": { "start": 1, "end": 1 }
      }
    }
  ],
  "overall_correctness": "patch is correct",
  "overall_explanation": "<string>",
  "overall_confidence_score": 0.0
}
```

#### Scenario: Tool submission succeeds
- **WHEN** the reviewer calls `submit_review` with valid arguments
- **THEN** pi validates the JSON against the TypeBox schema
- **AND** the tool stores the validated result in the closure variable
- **AND** the extension reads and uses it without additional parsing

#### Scenario: Tool submission with invalid arguments
- **WHEN** the reviewer calls `submit_review` with malformed arguments
- **THEN** pi returns a validation error to the model (e.g., `"findings[0].priority must be integer"`)
- **AND** the model can retry with corrected arguments

#### Scenario: Model never calls submit_review
- **WHEN** the reviewer finishes without calling `submit_review`
- **THEN** the closure variable remains undefined
- **AND** the extension extracts the final assistant message text from `session.messages`
- **AND** returns a failed `ReviewResult` with the extracted text as explanation

#### Scenario: Finding priority is out of range
- **WHEN** the reviewer returns a finding priority outside `0` through `3`
- **THEN** the extension clamps or normalizes the priority to a valid value before rendering

### Requirement: Session errors are handled gracefully
The extension SHALL surface reviewer failures as user-facing review errors without crashing the main pi session.

#### Scenario: createAgentSession fails
- **WHEN** `createAgentSession()` throws an error (e.g., model not available, invalid auth)
- **THEN** the extension SHALL catch the error and inject a failed `supi-review` message containing the error message

#### Scenario: Reviewer session errors during execution
- **WHEN** an error occurs after `session.prompt()` is submitted (e.g., model error emitted via `agent_end` with error state)
- **THEN** the extension SHALL catch the error and inject a failed `supi-review` message containing the error summary

#### Scenario: Reviewer is aborted
- **WHEN** the user cancels the review or the command receives an abort signal
- **THEN** the extension SHALL call `session.abort()` to stop the reviewer
- **AND** record the review as canceled rather than failed

#### Scenario: Reviewer produces no assistant output
- **WHEN** the reviewer session emits `agent_end` but no `submit_review` was called and the final assistant text is empty
- **THEN** the extension SHALL return a failed review result explaining that no reviewer output was produced

## REMOVED Requirements

### Requirement: Reviewer runs in isolated tmux session with a submit_review tool
**Reason**: Replaced by `createAgentSession()`-based execution. Tmux adds an unnecessary external dependency with no observable benefit — `--print` mode produces no TUI output in the tmux pane.

**Migration**: The reviewer now runs as an in-process managed child session via `createAgentSession()`. The `submit_review` tool is registered as a `customTools` option on the session rather than a temp file extension. Temp file machinery (`-tool.ts`, `-runner.mjs`, `-exit.json`, `-pane.log`) is removed.
