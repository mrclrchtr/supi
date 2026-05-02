# Capability: lsp-diagnostic-context

## Purpose
Compact XML-framed diagnostic context injection for outstanding LSP diagnostics, with persistent TUI visibility via message renderer.

## Requirements

### Requirement: Outstanding diagnostics SHALL be injected as renderer-friendly custom message with XML prompt content
Before reading outstanding diagnostics, the system SHALL perform a bounded refresh of active LSP diagnostic state for currently open documents. When outstanding LSP diagnostics exist at the configured severity threshold after refresh, `before_agent_start` SHALL inject a custom message with `customType: "lsp-context"` and `display: true`. The visible `message.content` SHALL contain a renderer-friendly summary for the TUI. The raw diagnostic context SHALL be stored in `message.details.promptContent`, wrapped in `<extension-context source="supi-lsp">` XML tags, and restored by the `context` hook before the model-facing prompt is built. The message SHALL only be injected when diagnostics exist — zero-diagnostic turns SHALL produce no injected message.

#### Scenario: Diagnostics exist for open files
- **WHEN** the LSP servers report 2 errors in `manager.ts` and 1 warning in `lsp.ts` after the pre-turn diagnostic refresh completes or times out
- **THEN** `before_agent_start` returns a message with:
  - `customType: "lsp-context"`
  - `display: true`
  - `content: "LSP diagnostics injected (2 errors, 1 warning)"`
  - `details.promptContent` equal to:
    ```
    <extension-context source="supi-lsp">
    Outstanding diagnostics:
    - manager.ts: 2 errors
    - lsp.ts: 1 warning
    </extension-context>
    ```

#### Scenario: Visible summary is restored to XML prompt content for the model
- **WHEN** `before_agent_start` injects a visible `lsp-context` message
- **THEN** the `context` hook restores `message.details.promptContent` as the model-facing message content
- **AND** the TUI-visible summary remains renderer-friendly

#### Scenario: No diagnostics exist
- **WHEN** all open files have zero diagnostics at the configured severity threshold after the pre-turn diagnostic refresh completes or times out
- **THEN** `before_agent_start` returns no message (zero extra tokens)

#### Scenario: Diagnostics at different severity levels
- **WHEN** `PI_LSP_SEVERITY` is set to `2` (errors + warnings)
- **THEN** the summary includes both errors and warnings but omits info and hints

#### Scenario: Dependent-file diagnostics settle before context injection
- **WHEN** a prior edit to file A causes the LSP server to publish updated diagnostics for dependent file B during the bounded pre-turn refresh
- **THEN** `before_agent_start` builds the diagnostic context from the updated diagnostics for file B

#### Scenario: Diagnostic refresh reaches timeout
- **WHEN** an LSP server does not finish publishing diagnostics before the bounded pre-turn refresh timeout
- **THEN** `before_agent_start` proceeds using the freshest diagnostics available in the cache
- **AND** the agent turn is not blocked indefinitely

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

### Requirement: Pre-turn diagnostic refresh SHALL occur before diagnostic fingerprinting
The system SHALL perform the bounded pre-turn diagnostic refresh before formatting and fingerprinting diagnostic context. Fingerprint deduplication SHALL compare the refreshed diagnostic content, not the stale cache content that existed before refresh.

#### Scenario: Stale fingerprint changes after refresh
- **WHEN** the cached diagnostic summary matches the previous fingerprint before refresh
- **AND** the bounded refresh clears or changes those diagnostics
- **THEN** fingerprinting uses the refreshed diagnostic summary
- **AND** stale diagnostic context is not suppressed or re-injected based on the pre-refresh cache

### Requirement: Human SHALL be notified when diagnostic context is injected
When diagnostic context is injected, the system SHALL display a persistent, collapsible message in the TUI via the registered `lsp-context` message renderer. The message provides both a collapsed summary and expandable per-file details. This replaces the previous ephemeral `ctx.ui.notify()` call, which fades after seconds and leaves no persistent record.

#### Scenario: Diagnostics injected
- **WHEN** `before_agent_start` injects a diagnostic context message with `display: true`
- **THEN** the registered `lsp-context` message renderer displays a collapsible message in the TUI showing a summary like `🔧 LSP diagnostics injected (2 errors, 5 warnings)`
- **AND** no `ctx.ui.notify()` call is made for diagnostic summary

#### Scenario: No diagnostics
- **WHEN** no diagnostic message is injected
- **THEN** no message is rendered and no notification is shown
