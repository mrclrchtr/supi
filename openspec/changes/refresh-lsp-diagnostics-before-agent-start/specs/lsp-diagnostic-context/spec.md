## MODIFIED Requirements

### Requirement: Outstanding diagnostics SHALL be injected as XML-framed user message
Before reading outstanding diagnostics, the system SHALL perform a bounded refresh of active LSP diagnostic state for currently open documents. When outstanding LSP diagnostics exist at the configured severity threshold after refresh, the system SHALL inject a user-role message via `before_agent_start` with `customType: "lsp-context"` and `display: false`. The message content SHALL be wrapped in `<extension-context source="supi-lsp">` XML tags. The message SHALL only be injected when diagnostics exist — zero-diagnostic turns SHALL produce no injected message.

#### Scenario: Diagnostics exist for open files
- **WHEN** the LSP servers report 2 errors in `manager.ts` and 1 warning in `lsp.ts` after the pre-turn diagnostic refresh completes or times out
- **THEN** `before_agent_start` returns a message with content:
  ```
  <extension-context source="supi-lsp">
  Outstanding diagnostics:
  - manager.ts: 2 errors
  - lsp.ts: 1 warning
  </extension-context>
  ```

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
