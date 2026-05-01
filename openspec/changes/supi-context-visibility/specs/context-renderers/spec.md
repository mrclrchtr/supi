## ADDED Requirements

### Requirement: supi-claude-md-refresh message renderer
The `supi-claude-md` extension SHALL register a `registerMessageRenderer("supi-claude-md-refresh", ...)` handler in its extension factory function. The renderer SHALL return a `Box` component with `customMessageBg` background containing a `Text` component. When collapsed, it SHALL display a one-line summary: `📄 CLAUDE.md refreshed (N files)` where N is the number of context files (derived from the file count in `details`). When expanded, it SHALL additionally list each context file path and the context token identifier, styled with `theme.fg("dim", ...)`.

#### Scenario: Collapsed view with multiple files
- **WHEN** a `supi-claude-md-refresh` message is rendered in collapsed state with details `{ contextToken: "supi-claude-md-3", turn: 3 }` and content containing 3 file blocks
- **THEN** the renderer displays `📄 CLAUDE.md refreshed (3 files)` with `accent` color on the icon and label

#### Scenario: Expanded view with file details
- **WHEN** a `supi-claude-md-refresh` message is rendered in expanded state with details `{ contextToken: "supi-claude-md-3", turn: 3 }`
- **THEN** the renderer displays the collapsed summary plus a line showing `  token: supi-claude-md-3` in `dim` color

#### Scenario: Message with missing details
- **WHEN** a `supi-claude-md-refresh` message is rendered with undefined or null details
- **THEN** the renderer displays `📄 CLAUDE.md refreshed` without the file count

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