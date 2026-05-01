# Capability: lsp-diagnostic-context

## Purpose
Compact XML-framed diagnostic context injection for outstanding LSP diagnostics, with persistent TUI visibility via message renderer.

## Requirements

### Requirement: Outstanding diagnostics SHALL be injected as XML-framed user message
When outstanding LSP diagnostics exist at the configured severity threshold, the system SHALL inject a user-role message via `before_agent_start` with `customType: "lsp-context"` and `display: true`. The message content SHALL be wrapped in `<extension-context source="supi-lsp">` XML tags. The message SHALL only be injected when diagnostics exist — zero-diagnostic turns SHALL produce no injected message.

#### Scenario: Diagnostics exist for open files
- **WHEN** the LSP servers report 2 errors in `manager.ts` and 1 warning in `lsp.ts`
- **THEN** `before_agent_start` returns a message with `display: true` and content:
  ```
  <extension-context source="supi-lsp">
  Outstanding diagnostics:
  - manager.ts: 2 errors
  - lsp.ts: 1 warning
  </extension-context>
  ```

#### Scenario: No diagnostics exist
- **WHEN** all open files have zero diagnostics at the configured severity threshold
- **THEN** `before_agent_start` returns no message (zero extra tokens)

#### Scenario: Diagnostics at different severity levels
- **WHEN** `PI_LSP_SEVERITY` is set to `2` (errors + warnings)
- **THEN** the summary includes both errors and warnings but omits info and hints

### Requirement: Diagnostic context SHALL be prepended before the user prompt
The system SHALL use the shared `pruneAndReorderContextMessages` function from `supi-core` (with `customType: "lsp-context"` and the active token) to filter stale `lsp-context` messages and reorder the active one before the last user message. The previous local `reorderDiagnosticContextMessages` implementation in `supi-lsp/guidance.ts` SHALL be replaced by this shared function. The behavior SHALL remain identical: stale messages are removed, the active message is moved before the last user message, and unchanged arrays produce no return value.

#### Scenario: Extension message is reordered
- **WHEN** pi appends the `lsp-context` message after the user message (hardcoded order)
- **THEN** the `context` event handler calls `pruneAndReorderContextMessages(messages, "lsp-context", activeToken)` which moves it before the last user message
- **AND** the user's actual prompt is the final user-role message in the LLM context

#### Scenario: No diagnostic message exists
- **WHEN** `before_agent_start` did not inject a message (no diagnostics)
- **THEN** the `context` event handler calls `pruneAndReorderContextMessages(messages, "lsp-context", null)` which removes all stale `lsp-context` messages and performs no reordering

### Requirement: Stale diagnostic context SHALL be filtered from conversation history
The system SHALL use the shared `pruneAndReorderContextMessages` function from `supi-core` to filter stale `lsp-context` messages from previous prompts, keeping only the current prompt's diagnostic message (if any). This replaces the previous local `reorderDiagnosticContextMessages` implementation with identical semantics.

#### Scenario: Multiple prompts with diagnostics
- **WHEN** the conversation contains `lsp-context` messages from 3 previous prompts and 1 from the current prompt
- **THEN** `pruneAndReorderContextMessages(messages, "lsp-context", activeToken)` returns only the current prompt's message

#### Scenario: Previous diagnostics resolved
- **WHEN** the conversation contains `lsp-context` messages from previous prompts but the current prompt has no diagnostics
- **THEN** `pruneAndReorderContextMessages(messages, "lsp-context", null)` removes all `lsp-context` messages

### Requirement: Diagnostic summary SHALL be deduplicated across turns
The system SHALL fingerprint the diagnostic summary content and skip injection when the summary is identical to the previously injected one. This avoids re-injecting the same diagnostics on consecutive prompts where no files were edited.

#### Scenario: Diagnostics unchanged between prompts
- **WHEN** the user sends a second prompt without editing any files
- **AND** the diagnostic summary is identical to the one injected on the previous prompt
- **THEN** `before_agent_start` does not inject a new diagnostic message

#### Scenario: Diagnostics change after edit
- **WHEN** the user sends a prompt after editing a file that changes the diagnostic count
- **THEN** `before_agent_start` injects a new diagnostic message with the updated summary

### Requirement: Human SHALL be notified when diagnostic context is injected
When diagnostic context is injected, the system SHALL display a persistent, collapsible message in the TUI via the registered `lsp-context` message renderer. The message provides both a collapsed summary and expandable per-file details. This replaces the previous ephemeral `ctx.ui.notify()` call, which fades after seconds and leaves no persistent record.

#### Scenario: Diagnostics injected
- **WHEN** `before_agent_start` injects a diagnostic context message with `display: true`
- **THEN** the registered `lsp-context` message renderer displays a collapsible message in the TUI showing a summary like `🔧 LSP diagnostics injected (2 errors, 5 warnings)`
- **AND** no `ctx.ui.notify()` call is made for diagnostic summary

#### Scenario: No diagnostics
- **WHEN** no diagnostic message is injected
- **THEN** no message is rendered and no notification is shown
