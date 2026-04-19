## ADDED Requirements

### Requirement: code_intel tool registration with search actions
The system SHALL register a `code_intel` tool with the pi agent that accepts an `action` parameter using `StringEnum` with values `"callers"`, `"implementations"`, `"pattern"`, `"brief"`, and `"affected"`.

#### Scenario: Tool appears in agent tool list
- **WHEN** the extension loads
- **THEN** a `code_intel` tool is available to the agent with a description listing all supported actions, a `promptSnippet`, and `promptGuidelines` that name `code_intel` explicitly

### Requirement: Callers action
The system SHALL support `action: "callers"` to find all call sites of a symbol, returning results grouped by file with a summary.

#### Scenario: Symbol with multiple callers across files
- **WHEN** the agent calls `code_intel` with `action: "callers"`, `symbol: "makeCtx"`
- **THEN** the tool returns call sites grouped by file, each with file path, line number, and the calling line, plus a summary line (e.g., "5 callers across 3 files")

#### Scenario: Symbol with no callers
- **WHEN** the agent calls `code_intel` with `action: "callers"` for a symbol with no references
- **THEN** the tool returns "No callers found for <symbol>"

### Requirement: Implementations action
The system SHALL support `action: "implementations"` to find concrete implementations of an interface or abstract class.

#### Scenario: Interface with multiple implementations
- **WHEN** the agent calls `code_intel` with `action: "implementations"`, `symbol: "ToolDefinition"`
- **THEN** the tool returns a list of concrete implementations with file paths and class/struct names

#### Scenario: Symbol is not an interface or has no implementations
- **WHEN** the agent calls `code_intel` with `action: "implementations"` for a concrete class
- **THEN** the tool returns "No implementations found for <symbol>"

### Requirement: Pattern search action
The system SHALL support `action: "pattern"` for text-based pattern search using ripgrep, returning structured results with context lines.

#### Scenario: Pattern matches in multiple files
- **WHEN** the agent calls `code_intel` with `action: "pattern"`, `pattern: "createPiMock"`, optional `path: "packages/supi-ask-user/"`
- **THEN** the tool returns matches with file path, line number, matching line, and ±2 lines of context, grouped by file, with a summary

#### Scenario: No matches
- **WHEN** the agent calls `code_intel` with `action: "pattern"` and the pattern matches nothing
- **THEN** the tool returns "No matches found for pattern: <pattern>"

### Requirement: Output truncation
All search results SHALL be truncated to pi's output limits (50KB / 2000 lines) using `truncateHead`.

#### Scenario: Large result set
- **WHEN** a search returns more than 2000 lines of output
- **THEN** the tool truncates the output and appends a note indicating truncation with the total match count

### Requirement: Graceful fallback without LSP
When no LSP server is available for a file type, semantic search actions (`callers`, `implementations`) SHALL return a clear message indicating LSP is unavailable, while `pattern` continues to work via ripgrep.

#### Scenario: Searching a Python file with no Python LSP configured
- **WHEN** the agent calls `code_intel` with `action: "callers"` on a `.py` file
- **THEN** the tool returns a message indicating no LSP server is available and suggests using `action: "pattern"` instead
