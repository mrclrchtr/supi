## REMOVED Requirements

### Requirement: Runtime LSP context SHALL activate from qualifying source interactions
**Reason**: Replaced by `lsp-proactive-scan`. Server detection and startup happens proactively at session_start. No reactive activation tracking needed.
**Migration**: LSP capabilities are declared in `promptGuidelines` at session_start. Diagnostics are injected via `lsp-diagnostic-context` when they exist.

### Requirement: Turn-start LSP coverage guidance
**Reason**: Replaced by `lsp-tool-guidance` (project-specific `promptGuidelines` in system prompt) and `lsp-diagnostic-context` (XML-framed diagnostics). The reactive per-turn injection of "LSP ready" and tracking messages is removed.
**Migration**: System prompt contains static capabilities. Diagnostics are injected as `<extension-context>` only when present.

### Requirement: Outstanding diagnostics are surfaced before prompts
**Reason**: Replaced by `lsp-diagnostic-context` which uses XML-framed `<extension-context>` messages prepended before the user prompt, with dedup fingerprinting and human notification.
**Migration**: Diagnostics injection continues but with improved framing, positioning, and dedup.

### Requirement: Pre-turn semantic context SHALL remain bounded
**Reason**: No longer needed. The new system injects zero messages when no diagnostics exist (no activation hints, no tracking messages, no coverage announcements). When diagnostics exist, the message is a compact XML-framed summary.
**Migration**: Bounded by design — only diagnostics are injected, only when present.
