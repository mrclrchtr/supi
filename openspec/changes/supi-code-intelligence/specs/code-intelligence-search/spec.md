## ADDED Requirements

### Requirement: The system SHALL register a `code_intel` tool
The extension SHALL register a tool named `code_intel` with an `action` parameter supporting the values `brief`, `callers`, `implementations`, `affected`, and `pattern`.

#### Scenario: Tool registration
- **WHEN** the extension loads successfully
- **THEN** the `code_intel` tool appears in the agent tool list with its supported actions documented in its description and prompt guidance

### Requirement: `code_intel` guidance SHALL make correct tool use obvious and attractive
The tool SHALL provide compact `promptSnippet` and `promptGuidelines` that explain when `code_intel` saves tokens or improves correctness compared with broad file reads, raw `rg`, or direct low-level tool use. Every prompt guideline SHALL explicitly name `code_intel` because pi flattens tool guidelines into the global `Guidelines:` section.

#### Scenario: Agent needs orientation before editing
- **WHEN** the agent is about to edit an unfamiliar package, directory, or file
- **THEN** prompt guidance encourages `code_intel brief` as the preferred orientation step before reading many files manually

#### Scenario: Agent needs impact analysis before a shared change
- **WHEN** the agent is about to change an exported API, shared helper, config surface, or cross-package contract
- **THEN** prompt guidance encourages `code_intel affected` before editing

#### Scenario: Agent needs low-level drill-down
- **WHEN** `code_intel` identifies a relevant file, symbol, or syntax node but the agent needs exact type, definition, or AST details
- **THEN** prompt guidance positions raw `lsp` and `tree_sitter` as complementary drill-down tools rather than replacements for `code_intel`

### Requirement: Tool parameters SHALL support token-efficient refinement
The `code_intel` parameter schema SHALL keep common calls short while allowing agents to bound result size intentionally. In addition to action-specific inputs (`path`, `symbol`, `file`, `line`, `character`, and search pattern), search-oriented actions SHOULD support optional result and context controls such as `maxResults` and `contextLines` with safe defaults.

#### Scenario: Agent asks for a concise pattern search
- **WHEN** the agent calls `code_intel` with `action: "pattern"`, a search pattern, and a small `maxResults` value
- **THEN** the tool limits returned matches to the requested budget and reports omitted-match counts when more evidence exists

#### Scenario: Agent omits refinement controls
- **WHEN** the agent calls any `code_intel` action without result-size controls
- **THEN** the tool uses token-efficient defaults rather than returning an unbounded dump

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

### Requirement: Search output SHALL be summary-first and bounded to pi output limits
The system SHALL return search and relationship output as structured markdown with a concise summary first, grouped evidence, confidence labels, and file/line references where available. It SHALL truncate oversized search output to fit pi output limits (50KB / 2000 lines) using the repository standard truncation helper where practical, and SHALL note when truncation occurred.

#### Scenario: Semantic result summary
- **WHEN** a `callers` or `implementations` action returns semantic results
- **THEN** the first lines summarize the number of files, matches, and confidence source before listing grouped evidence

#### Scenario: Very large search result
- **WHEN** a `callers`, `implementations`, or `pattern` action produces output larger than pi's tool output limits
- **THEN** the tool truncates the output and includes a note that the result was truncated

#### Scenario: Long tail omitted by default budget
- **WHEN** a search action finds more matches than the default or requested result budget
- **THEN** the tool reports how many matches were omitted and suggests narrowing the query or raising the limit
