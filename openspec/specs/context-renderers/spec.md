# Capability: context-renderers

## Purpose
Custom `registerMessageRenderer` implementations for active injected-context message types, with `lsp-context` as the normative renderer.

## Requirements

### Requirement: lsp-context message renderer
The `supi-lsp` extension SHALL register a `registerMessageRenderer("lsp-context", ...)` handler in its extension factory function. The renderer SHALL return a `Box` component with `customMessageBg` background containing a `Text` component. When collapsed, it SHALL display a compact diagnostic summary with colored severity icons (errors in `error` color, warnings in `warning` color, clean in `success` color). When expanded, it SHALL additionally show the per-file diagnostic breakdown and the context token.

#### Scenario: Collapsed view with errors and warnings
- **WHEN** an `lsp-context` message is rendered in collapsed state with details `{ contextToken: "lsp-context-5", inlineSeverity: "error" }` and the message content includes error and warning counts
- **THEN** the renderer displays a summary like `🔧 LSP diagnostics injected (2 errors, 5 warnings)` with `error` color for the error count and `warning` color for the warning count

#### Scenario: Collapsed view with clean diagnostics
- **WHEN** an `lsp-context` message is rendered in collapsed state with details `{ contextToken: "lsp-context-5", inlineSeverity: "error" }` and the message content has no errors
- **THEN** the renderer displays `🔧 LSP diagnostics injected ✓` with `success` color on the checkmark

#### Scenario: Expanded view with per-file breakdown
- **WHEN** an `lsp-context` message is rendered in expanded state
- **THEN** the renderer displays the collapsed summary plus the per-file diagnostic breakdown and `  token: lsp-context-5` in `dim` color

#### Scenario: Message with missing details
- **WHEN** an `lsp-context` message is rendered with undefined or null details
- **THEN** the renderer displays `🔧 LSP diagnostics injected` without counts
