## MODIFIED Requirements

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
