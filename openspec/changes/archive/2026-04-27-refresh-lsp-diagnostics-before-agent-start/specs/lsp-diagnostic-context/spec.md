## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Pre-turn diagnostic refresh SHALL occur before diagnostic fingerprinting
The system SHALL perform the bounded pre-turn diagnostic refresh before formatting and fingerprinting diagnostic context. Fingerprint deduplication SHALL compare the refreshed diagnostic content, not the stale cache content that existed before refresh.

#### Scenario: Stale fingerprint changes after refresh
- **WHEN** the cached diagnostic summary matches the previous fingerprint before refresh
- **AND** the bounded refresh clears or changes those diagnostics
- **THEN** fingerprinting uses the refreshed diagnostic summary
- **AND** stale diagnostic context is not suppressed or re-injected based on the pre-refresh cache
