## ADDED Requirements

### Requirement: Workspace symbol search action
The system SHALL support `action: "workspace_symbol"` to search for symbols across the project by fuzzy name query.

#### Scenario: Symbol found in project
- **WHEN** the agent calls `lsp` with `action: "workspace_symbol"`, `query: "getSettingsListTheme"`
- **THEN** the tool returns a list of matching symbols with name, kind, file path, line, and character

#### Scenario: No matching symbols
- **WHEN** the agent calls `lsp` with `action: "workspace_symbol"`, `query: "nonExistentSymbol"`
- **THEN** the tool returns a message indicating no symbols were found

#### Scenario: LSP server does not support workspace/symbol
- **WHEN** the agent calls `lsp` with `action: "workspace_symbol"` and the active server lacks workspace symbol support
- **THEN** the tool returns a message indicating workspace symbol search is not available for this server

### Requirement: Search action with fallback
The system SHALL support `action: "search"` to find symbols, first trying workspace symbol search then falling back to text search if LSP returns nothing.

#### Scenario: Symbol found via LSP
- **WHEN** the agent calls `lsp` with `action: "search"`, `query: "formatDiagnostics"`
- **THEN** the tool returns LSP workspace symbol results if any exist

#### Scenario: Symbol not in LSP index, found via text search
- **WHEN** the agent calls `lsp` with `action: "search"`, `query: "getSettingsListTheme"` and the symbol is in node_modules (not in LSP workspace index)
- **THEN** the tool falls back to text search and returns file matches with line numbers

### Requirement: Symbol-name hover action
The system SHALL support `action: "symbol_hover"` to retrieve hover info for a symbol by name, resolving the symbol position internally.

#### Scenario: Symbol resolved and hover returned
- **WHEN** the agent calls `lsp` with `action: "symbol_hover"`, `symbol: "getSettingsListTheme"`
- **THEN** the tool resolves the symbol via workspace symbol search, calls hover at the first match, and returns the hover content

#### Scenario: Symbol not found
- **WHEN** the agent calls `lsp` with `action: "symbol_hover"`, `symbol: "nonExistentSymbol"`
- **THEN** the tool returns a message indicating the symbol was not found

#### Scenario: Multiple symbols with same name
- **WHEN** the agent calls `lsp` with `action: "symbol_hover"`, `symbol: "handleInput"` and multiple symbols match
- **THEN** the tool returns hover for the first match and includes a note about other matches
