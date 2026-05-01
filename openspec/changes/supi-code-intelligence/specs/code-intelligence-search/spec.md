## ADDED Requirements

### Requirement: The system SHALL register a `code_intel` tool
The extension SHALL register a tool named `code_intel` with an `action` parameter supporting the values `brief`, `callers`, `implementations`, `affected`, and `pattern`.

#### Scenario: Tool registration
- **WHEN** the extension loads successfully
- **THEN** the `code_intel` tool appears in the agent tool list with its supported actions documented in its description and prompt guidance

### Requirement: Semantic actions SHALL resolve a concrete target before returning semantic results
For `callers` and `implementations`, the tool SHALL accept either an anchored target (`file`, `line`, and `character`) or a discovery input such as `symbol`. If discovery input resolves to multiple plausible targets, the tool SHALL return a disambiguation result instead of silently merging or selecting one target.

#### Scenario: Anchored semantic target
- **WHEN** the agent calls `code_intel` with `action: "callers"`, `file`, `line`, and `character`
- **THEN** the tool analyzes the symbol at that concrete position

#### Scenario: Ambiguous symbol discovery
- **WHEN** the agent calls `code_intel` with `action: "implementations"` and a `symbol` value that matches multiple declarations
- **THEN** the tool returns the matching candidate targets and asks for disambiguation instead of returning merged implementation results

### Requirement: `action: "callers"` SHALL return grouped caller results with confidence labeling
The system SHALL support `action: "callers"` to find call sites for a resolved symbol target and return results grouped by file with a summary. If semantic support is unavailable, the result SHALL clearly label any fallback output as heuristic.

#### Scenario: Semantic caller results available
- **WHEN** the agent calls `code_intel` with `action: "callers"` for a resolved target that has LSP reference data
- **THEN** the tool returns call sites grouped by file with file paths, line numbers, and a summary such as the number of callers and files affected

#### Scenario: Only heuristic fallback is available
- **WHEN** the agent calls `code_intel` with `action: "callers"` for a symbol in a context without usable LSP references but with fallback search matches
- **THEN** the tool returns the fallback matches labeled clearly as heuristic caller hints rather than semantic caller results

### Requirement: `action: "implementations"` SHALL return implementation candidates with confidence labeling
The system SHALL support `action: "implementations"` to find concrete implementations of an interface, abstract type, or contract-like symbol. When the shared LSP service provides implementation-provider support, semantic results SHALL use that support. If semantic support is unavailable, any fallback results SHALL be labeled as heuristic candidates.

#### Scenario: Semantic implementations available
- **WHEN** the agent calls `code_intel` with `action: "implementations"` for a resolved target and the shared LSP service supports implementation requests for that file
- **THEN** the tool returns concrete implementation results with file paths and symbol names

#### Scenario: Semantic support unavailable
- **WHEN** the agent calls `code_intel` with `action: "implementations"` for a resolved target without usable LSP implementation support
- **THEN** the tool either returns clearly labeled heuristic implementation candidates or a message that semantic implementations are unavailable

### Requirement: `action: "pattern"` SHALL provide structured text search results
The system SHALL support `action: "pattern"` using text search and return results grouped by file with matching lines and nearby context.

#### Scenario: Pattern search with multiple matches
- **WHEN** the agent calls `code_intel` with `action: "pattern"` and a pattern that matches multiple files
- **THEN** the tool returns grouped matches with file paths, line numbers, matching lines, and nearby context plus a summary of total matches

#### Scenario: No pattern matches
- **WHEN** the agent calls `code_intel` with `action: "pattern"` and the pattern matches nothing
- **THEN** the tool returns a message indicating that no matches were found

### Requirement: Search output SHALL be bounded to pi output limits
The system SHALL truncate oversized search output to fit pi output limits (50KB / 2000 lines) using the repository standard truncation helper where practical, and SHALL note when truncation occurred.

#### Scenario: Very large search result
- **WHEN** a `callers`, `implementations`, or `pattern` action produces output larger than pi's tool output limits
- **THEN** the tool truncates the output and includes a note that the result was truncated
