# Capability: lsp-workspace-symbol

## Purpose
Fuzzy symbol search across the project via the LSP `workspace/symbol` request, enabling agent exploration without exact coordinates.

## Requirements

### Requirement: Workspace symbol search
The system SHALL send `workspace/symbol` to the active LSP server with a query string and return formatted results.

#### Scenario: Exact match
- **WHEN** the agent queries `"getSettingsListTheme"` and the server returns one exact match
- **THEN** the system returns the symbol name, kind (function), file path, line, character, and container name

#### Scenario: Fuzzy match
- **WHEN** the agent queries `"getSetListTheme"` and the server returns fuzzy matches
- **THEN** the system returns all matches with their relevance scores if available

#### Scenario: Server lacks workspace symbol capability
- **WHEN** the active server's capabilities do not include `workspaceSymbolProvider`
- **THEN** the system returns a clear message: "Workspace symbol search not supported by this language server"

#### Scenario: Empty query
- **WHEN** the agent provides an empty or whitespace-only query
- **THEN** the system returns a message indicating a non-empty query is required

### Requirement: Symbol result formatting
The system SHALL format workspace symbol results as a concise list with key information.

#### Scenario: Multiple results
- **WHEN** the query returns 5 symbols
- **THEN** each result shows: `name` (kind) — `container` — `file:line:character`

### Requirement: Integration with search action
The `search` action SHALL use workspace symbol as its primary lookup mechanism before falling back.

#### Scenario: Search finds symbol via LSP
- **WHEN** the `search` action queries a symbol that exists in the workspace index
- **THEN** it returns LSP workspace symbol results without invoking text search
