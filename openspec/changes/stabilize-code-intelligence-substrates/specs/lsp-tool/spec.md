## ADDED Requirements

### Requirement: LSP tool actions SHALL validate required parameters explicitly
The system SHALL validate action-specific parameters for the standalone `lsp` tool before attempting execution, and SHALL return a clear validation error instead of relying on thrown exceptions or partial handler execution.

Parameter rules:
- `hover`, `definition`, `references`, and `code_actions` require `file`, `line`, and `character`
- `rename` requires `file`, `line`, `character`, and non-empty `newName`
- `symbols` requires `file`
- `diagnostics` accepts optional `file`
- `workspace_symbol` and `search` require non-empty `query`
- `symbol_hover` requires non-empty `symbol`

#### Scenario: Missing file-position parameters
- **WHEN** the agent calls `lsp` with `action: "hover"` and omits `line` or `character`
- **THEN** the tool returns a validation error indicating which required parameter is missing

#### Scenario: Missing rename target
- **WHEN** the agent calls `lsp` with `action: "rename"` and omits `newName`
- **THEN** the tool returns a validation error indicating that `newName` is required

#### Scenario: Missing search query
- **WHEN** the agent calls `lsp` with `action: "workspace_symbol"` or `action: "search"` and provides an empty `query`
- **THEN** the tool returns a validation error instead of issuing an invalid LSP request or empty fallback search

#### Scenario: Missing symbol name
- **WHEN** the agent calls `lsp` with `action: "symbol_hover"` and omits `symbol`
- **THEN** the tool returns a validation error indicating that `symbol` is required

### Requirement: LSP tool file paths SHALL resolve from the session working directory
The system SHALL resolve relative `file` inputs for the standalone `lsp` tool from the current pi/session working directory instead of ambient process state, and SHALL return a clear file or server error when the requested path cannot be opened.

#### Scenario: Relative file input
- **WHEN** the agent calls `lsp` with `action: "symbols"` and `file: "src/index.ts"` from a session rooted at `/repo`
- **THEN** the tool resolves the request against `/repo`
- **AND** the resulting LSP operations target `/repo/src/index.ts`

#### Scenario: Missing file input for diagnostics
- **WHEN** the agent calls `lsp` with `action: "diagnostics"` and `file: "src/missing.ts"`
- **THEN** the tool returns a clear file access or unavailable-server error instead of relying on a thrown exception or incorrect ambient cwd resolution
