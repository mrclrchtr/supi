## MODIFIED Requirements

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

### Requirement: Human SHALL be notified when diagnostic context is injected
When diagnostic context is injected, the system SHALL display a persistent, collapsible message in the TUI via the registered `lsp-context` message renderer. The message provides both a collapsed summary and expandable per-file details. This replaces the previous ephemeral `ctx.ui.notify()` call, which fades after seconds and leaves no persistent record.

#### Scenario: Diagnostics injected
- **WHEN** `before_agent_start` injects a diagnostic context message with `display: true`
- **THEN** the registered `lsp-context` message renderer displays a collapsible message in the TUI showing a summary like `🔧 LSP diagnostics injected (2 errors, 5 warnings)`
- **AND** no `ctx.ui.notify()` call is made for diagnostic summary

#### Scenario: No diagnostics
- **WHEN** no diagnostic message is injected
- **THEN** no message is rendered and no notification is shown