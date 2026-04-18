# Capability: lsp-diagnostic-context

## Purpose
Compact XML-framed diagnostic context injection for outstanding LSP diagnostics.

## ADDED Requirements

### Requirement: Outstanding diagnostics SHALL be injected as XML-framed user message
When outstanding LSP diagnostics exist at the configured severity threshold, the system SHALL inject a user-role message via `before_agent_start` with `customType: "lsp-context"` and `display: false`. The message content SHALL be wrapped in `<extension-context source="supi-lsp">` XML tags. The message SHALL only be injected when diagnostics exist — zero-diagnostic turns SHALL produce no injected message.

#### Scenario: Diagnostics exist for open files
- **WHEN** the LSP servers report 2 errors in `manager.ts` and 1 warning in `lsp.ts`
- **THEN** `before_agent_start` returns a message with content:
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
The system SHALL use the `context` event to reorder the injected `lsp-context` message so it appears before the user's actual prompt in the LLM message list. The user's prompt SHALL be the last user-role message the LLM sees.

#### Scenario: Extension message is reordered
- **WHEN** pi appends the `lsp-context` message after the user message (hardcoded order)
- **THEN** the `context` event moves it before the last user message
- **AND** the user's actual prompt is the final user-role message in the LLM context

#### Scenario: No diagnostic message exists
- **WHEN** `before_agent_start` did not inject a message (no diagnostics)
- **THEN** the `context` event performs no reordering

### Requirement: Stale diagnostic context SHALL be filtered from conversation history
The system SHALL filter stale `lsp-context` messages from previous prompts in the `context` event, keeping only the current prompt's diagnostic message (if any). This prevents accumulation of outdated diagnostic snapshots in the LLM context.

#### Scenario: Multiple prompts with diagnostics
- **WHEN** the conversation contains `lsp-context` messages from 3 previous prompts and 1 from the current prompt
- **THEN** the `context` event removes the 3 stale messages and keeps only the current one

#### Scenario: Previous diagnostics resolved
- **WHEN** the conversation contains `lsp-context` messages from previous prompts but the current prompt has no diagnostics
- **THEN** the `context` event removes all stale `lsp-context` messages

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
When diagnostic context is injected, the system SHALL call `ctx.ui.notify()` with an informational message summarizing the diagnostics. This notification is visible only to the human user and has zero LLM token cost.

#### Scenario: Diagnostics injected
- **WHEN** `before_agent_start` injects a diagnostic context message
- **THEN** `ctx.ui.notify("ℹ️ LSP: 2 errors in manager.ts", "info")` is called

#### Scenario: No diagnostics
- **WHEN** no diagnostic message is injected
- **THEN** no notification is shown
