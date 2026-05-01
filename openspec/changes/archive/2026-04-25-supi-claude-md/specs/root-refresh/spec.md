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

The extension SHALL inject root context refresh as a persistent message returned from `before_agent_start` with `customType: "supi-claude-md-refresh"` and `display: true` (rendered via `registerMessageRenderer` as a compact UI summary). The message details SHALL include `contextToken` (unique per injection), `turn` (the turn count at injection time), and `promptContent` (the raw XML-wrapped content for the LLM).

#### Scenario: Refresh message injected on before_agent_start

- **WHEN** a refresh is due and the user sends a new prompt
- **THEN** the extension SHALL return a message from `before_agent_start` containing all root context files wrapped in `<extension-context>` tags

#### Scenario: Refresh message is hidden

- **WHEN** a refresh message is injected
- **THEN** the message SHALL have `display: true` and SHALL appear in the TUI as a compact summary (e.g. "CLAUDE.md refreshed (1 file)")

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

### Requirement: Interval-based root refresh only

The extension SHALL refresh root context files only on the configured `rereadInterval`. Compaction does not trigger an additional refresh.

#### Scenario: Compaction does not force refresh

- **WHEN** compaction occurs and the user sends a new prompt
- **THEN** the extension SHALL continue following the normal interval-based refresh timing

### Requirement: No manual refresh command

The extension SHALL NOT expose a dedicated `/supi-claude-md refresh` command. Root refresh is driven by the configured interval only.

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
