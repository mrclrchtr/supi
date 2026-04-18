## ADDED Requirements

### Requirement: Periodically re-inject root context files

The extension SHALL re-inject root/ancestor context files (those pi loaded natively at startup) every N completed assistant turns, where N is the configured `rereadInterval` (default: 3). A completed assistant turn is an assistant message with `stopReason: "stop"`.

#### Scenario: Root context refreshed after N turns

- **WHEN** `rereadInterval` is 3 and 3 assistant turns have completed since the last refresh
- **THEN** the extension SHALL inject a refresh message containing all root context file contents

#### Scenario: Tool-use substeps do not count

- **WHEN** an assistant message has `stopReason: "tool_use"` (not `"stop"`)
- **THEN** the extension SHALL NOT count it toward the reread interval

#### Scenario: Reread disabled

- **WHEN** `rereadInterval` is configured as `0` or `"off"`
- **THEN** the extension SHALL NOT perform periodic re-injection

### Requirement: Inject root refresh via before_agent_start persistent message

The extension SHALL inject root context refresh as a persistent message returned from `before_agent_start` with `customType: "supi-claude-md-refresh"` and `display: false`. The message details SHALL include `contextToken` (unique per injection) and `turn` (the turn count at injection time).

#### Scenario: Refresh message injected on before_agent_start

- **WHEN** a refresh is due and the user sends a new prompt
- **THEN** the extension SHALL return a message from `before_agent_start` containing all root context files wrapped in `<extension-context>` tags

#### Scenario: Refresh message is hidden

- **WHEN** a refresh message is injected
- **THEN** the message SHALL have `display: false` and SHALL NOT appear in the TUI

### Requirement: Prune stale refresh messages via context event

The extension SHALL register a `context` event handler that removes all refresh messages except the one with the current `contextToken`. The current refresh message SHALL be reordered to appear immediately before the last user message.

#### Scenario: Old refresh messages pruned

- **WHEN** the context event fires and the message array contains refresh messages with outdated `contextToken` values
- **THEN** those messages SHALL be removed from the array

#### Scenario: Current refresh reordered before last user message

- **WHEN** the context event fires and the current refresh message exists
- **THEN** it SHALL be moved to the position immediately before the last user message

#### Scenario: No active refresh

- **WHEN** there is no active `contextToken` (e.g., refresh disabled or no refresh has occurred)
- **THEN** all refresh messages SHALL be removed from the context

### Requirement: Re-inject after compaction

The extension SHALL re-inject root context files after compaction. When `session_compact` fires, the extension SHALL set an internal flag. On the next `before_agent_start`, if the flag is set, the extension SHALL inject a refresh regardless of the turn count.

#### Scenario: Compaction triggers refresh on next prompt

- **WHEN** compaction occurs and the user sends a new prompt
- **THEN** the extension SHALL inject a root context refresh even if the turn interval has not been reached

#### Scenario: Flag cleared after refresh

- **WHEN** the post-compaction refresh is injected
- **THEN** the flag SHALL be cleared and normal interval-based refresh SHALL resume

### Requirement: Manual refresh via command

The extension SHALL support a `/supi-claude-md refresh` command that immediately injects a root context refresh on the next `before_agent_start`, regardless of turn count or interval.

#### Scenario: User forces refresh

- **WHEN** the user runs `/supi-claude-md refresh`
- **THEN** the extension SHALL set the refresh flag and notify the user that refresh will occur on the next prompt

### Requirement: Reconstruct root refresh state on session start

The extension SHALL reconstruct its refresh state from session history on `session_start`. It SHALL count completed assistant turns and find the last custom message with `customType: "supi-claude-md-refresh"` to determine `lastRefreshTurn`.

#### Scenario: Extension reloads and reconstructs refresh state

- **WHEN** the extension is reloaded via `/reload` with 12 completed turns and last refresh at turn 9
- **THEN** the extension SHALL set `completedTurns: 12` and `lastRefreshTurn: 9`, and the next refresh SHALL occur at turn 12 (immediately, since 12 - 9 >= 3)

### Requirement: Root refresh SHALL NOT modify system prompt or trigger extra turns

The extension SHALL NOT modify the system prompt. The extension SHALL NOT use `sendMessage` or any mechanism that could trigger an additional LLM API call. Injection SHALL only occur through the `before_agent_start` return value.

#### Scenario: System prompt unchanged

- **WHEN** the extension injects a root refresh
- **THEN** `event.systemPrompt` SHALL NOT be modified in the return value

#### Scenario: No extra LLM calls

- **WHEN** a refresh is injected
- **THEN** no additional LLM API call SHALL be triggered beyond the one already in progress
