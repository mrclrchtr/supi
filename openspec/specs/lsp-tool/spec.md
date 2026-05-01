# Capability: lsp-tool

## Purpose
TBD

## Requirements

### Requirement: Single tool registration with action dispatch
The system SHALL register one `lsp` tool with the pi agent that accepts an `action` parameter to dispatch to specific LSP operations.

#### Scenario: Tool appears in agent tool list
- **WHEN** the extension loads
- **THEN** an `lsp` tool is available to the agent with a description listing all supported actions

### Requirement: Hover action
The system SHALL support `action: "hover"` to retrieve type information and documentation at a file position.

#### Scenario: Hover over a symbol with documentation
- **WHEN** the agent calls `lsp` with `action: "hover"`, `file: "src/index.ts"`, `line: 10`, `character: 5`
- **THEN** the tool returns the hover content (type signature, documentation) as markdown text

#### Scenario: Hover over whitespace
- **WHEN** the agent calls `lsp` with `action: "hover"` at a position with no symbol
- **THEN** the tool returns a message indicating no hover information is available

### Requirement: Go-to-definition action
The system SHALL support `action: "definition"` to find the definition location of a symbol.

#### Scenario: Definition in same project
- **WHEN** the agent calls `lsp` with `action: "definition"`, `file`, `line`, `character`
- **THEN** the tool returns the definition location(s) as file path, line, and character

#### Scenario: No definition found
- **WHEN** the symbol has no resolvable definition (e.g., built-in type)
- **THEN** the tool returns a message indicating no definition was found

### Requirement: Find-references action
The system SHALL support `action: "references"` to find all references to a symbol.

#### Scenario: Symbol with multiple references
- **WHEN** the agent calls `lsp` with `action: "references"`, `file`, `line`, `character`
- **THEN** the tool returns a list of locations (file, line, character) where the symbol is referenced

### Requirement: Document-symbols action
The system SHALL support `action: "symbols"` to list all symbols in a document.

#### Scenario: File with classes and functions
- **WHEN** the agent calls `lsp` with `action: "symbols"`, `file: "src/app.ts"`
- **THEN** the tool returns a hierarchical list of symbols with their kinds (class, function, variable, etc.) and positions

### Requirement: Diagnostics action
The system SHALL support `action: "diagnostics"` to retrieve current diagnostics for a file or all open files.

#### Scenario: File with type errors
- **WHEN** the agent calls `lsp` with `action: "diagnostics"`, `file: "src/broken.ts"`
- **THEN** the tool returns a list of diagnostics with severity, message, line, and character

#### Scenario: All-file diagnostics
- **WHEN** the agent calls `lsp` with `action: "diagnostics"` and no `file` parameter
- **THEN** the tool returns diagnostics for all currently open files, grouped by file

### Requirement: Rename action
The system SHALL support `action: "rename"` to compute a workspace-wide rename edit.

#### Scenario: Rename a function
- **WHEN** the agent calls `lsp` with `action: "rename"`, `file`, `line`, `character`, `newName: "betterName"`
- **THEN** the tool returns a workspace edit listing all files and text changes needed for the rename

### Requirement: Code-actions action
The system SHALL support `action: "code_actions"` to retrieve available code actions for a range.

#### Scenario: Quick-fix available for diagnostic
- **WHEN** the agent calls `lsp` with `action: "code_actions"`, `file`, `line`, `character`
- **THEN** the tool returns available code actions (quick-fix, refactor, organize imports, etc.) with their titles and edits

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

### Requirement: Graceful handling when no server available
The system SHALL return a clear error message when an LSP action is requested for a file with no configured or available server.

#### Scenario: Unsupported language
- **WHEN** the agent calls `lsp` with `action: "hover"` on a `.txt` file with no configured server
- **THEN** the tool returns an error message: "No LSP server available for this file type"
