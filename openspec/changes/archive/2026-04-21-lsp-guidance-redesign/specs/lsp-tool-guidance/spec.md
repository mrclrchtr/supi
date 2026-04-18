## MODIFIED Requirements

### Requirement: LSP tool prompt visibility
The system SHALL register the `lsp` tool with a `promptSnippet` and `promptGuidelines`. At `session_start`, the system SHALL re-register the tool with project-specific `promptGuidelines` derived from the proactive scan results and server capability introspection. The re-registration SHALL trigger `refreshTools()` → `_rebuildSystemPrompt()` so that capabilities are baked into `_baseSystemPrompt` and remain stable for the entire session (guaranteeing prompt caching).

#### Scenario: Tool registered with project-specific guidelines
- **WHEN** the `session_start` scan detects typescript-language-server with root `.` supporting hover, definition, references, symbols, rename, and code-actions
- **THEN** the tool is re-registered with `promptGuidelines` containing:
  - The server name, root, and supported file types
  - Only the actions supported by the server (from `ServerCapabilities`)
  - Each action's required parameters (e.g., `hover(file,line,char)`)
  - A fallback instruction for unsupported file types

#### Scenario: Multiple servers detected
- **WHEN** the scan detects typescript-language-server and rust-analyzer
- **THEN** the `promptGuidelines` list both servers with their respective roots, file types, and supported actions

#### Scenario: No servers detected
- **WHEN** no configured servers match the project (no rootMarkers or no binaries)
- **THEN** the tool is registered with generic fallback guidelines only

#### Scenario: System prompt stability
- **WHEN** the tool is re-registered at `session_start`
- **THEN** the `_baseSystemPrompt` is identical for every subsequent LLM call in the session
- **AND** `before_agent_start` never returns a `systemPrompt` modification

### Requirement: Guidance SHALL preserve fallback paths
The `lsp` tool guidance SHALL tell the agent to fall back to `bash` or file reads when LSP is unavailable, unsupported for the file type, or the task is plain-text rather than semantic code navigation.

#### Scenario: Unsupported file type
- **WHEN** the agent is working with a file type that has no configured or available LSP server
- **THEN** the prompt guidance allows fallback to non-LSP tools without implying that LSP is required

#### Scenario: Text search outside semantic workflows
- **WHEN** the task is to search docs, config files, string literals, or other non-symbol text patterns
- **THEN** the prompt guidance allows `bash`-based search instead of forcing `lsp`

## REMOVED Requirements

### Requirement: Semantic-first guidance for supported workflows
**Reason**: The soft nudge via `sendMessage`/`deliverAs: "steer"` when agents use text-search commands on LSP-supported files is removed. Proactive `promptGuidelines` with project-specific server and action information replace the per-command nudge.
**Migration**: Agents receive LSP preference guidance through `promptGuidelines` in the system prompt. No per-command steer messages are sent.

### Requirement: Soft nudge on semantic search for LSP-supported files
**Reason**: Removed as part of bash-guard deletion. The steer-based nudge injected user-role messages that confused agents and cost extra tokens/turns.
**Migration**: `promptGuidelines` contain "Prefer lsp over bash for semantic code navigation" as a static system prompt guideline.

### Requirement: No nudge for non-LSP files
**Reason**: Removed with the nudge system. No nudge logic exists to filter.
**Migration**: None needed — the nudge is gone entirely.
