## ADDED Requirements

### Requirement: The system SHALL register a `code_intel` tool
The extension SHALL register a tool named `code_intel` with an `action` parameter supporting the values `brief`, `callers`, `callees`, `implementations`, `affected`, and `pattern`.

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

#### Scenario: Lower-level code tools are also active
- **WHEN** the `lsp` and `tree_sitter` tools are active in the same prompt as `code_intel`
- **THEN** the combined guidance still presents `code_intel` as the preferred first stop for architecture, impact, and summarized relationship questions
- **AND** it presents `lsp` and `tree_sitter` as precise drill-down tools after `code_intel` has narrowed the target

### Requirement: Tool parameters SHALL support token-efficient refinement
The `code_intel` parameter schema SHALL keep common calls short while allowing agents to bound result size intentionally. In addition to action-specific inputs (`path`, `symbol`, `file`, `line`, `character`, and search pattern), search-oriented actions SHOULD support optional result and context controls such as `maxResults` and `contextLines` with safe defaults. Text-search and discovery-oriented actions SHOULD support a `path` scope when practical so agents can restrict analysis to a package, directory, or file instead of paying for whole-repository results. Discovery-oriented semantic actions SHOULD also support optional narrowing filters such as symbol `kind` and `exportedOnly` when those filters materially reduce ambiguity or token cost. In v1, `exportedOnly` is the canonical public-surface filter; a broader language-specific `publicOnly` concept is deferred.

The schema SHALL remain flat and role-oriented:
- `path` scopes or focuses analysis to a package, directory, or file path
- `file` anchors a concrete location and SHOULD usually be paired with `line` and `character`
- `symbol` is for semantic discovery when the exact location is not yet known
- `pattern` is reserved for the text-search action and SHALL NOT double as a generic symbol query field
- `maxResults`, `contextLines`, `kind`, and `exportedOnly` are optional refinements

Example v1 calls SHOULD stay short and copyable, for example:
```json
{ "action": "brief", "path": "packages/supi-lsp/" }
{ "action": "brief", "file": "packages/supi-lsp/lsp.ts", "line": 42, "character": 7 }
{ "action": "callers", "symbol": "registerSettings", "path": "packages/supi-core/", "exportedOnly": true }
{ "action": "callees", "file": "packages/supi-lsp/tool-actions.ts", "line": 88, "character": 12 }
{ "action": "implementations", "symbol": "SessionLspService", "path": "packages/" }
{ "action": "affected", "file": "packages/supi-core/index.ts", "line": 12, "character": 8 }
{ "action": "pattern", "pattern": "registerSettings", "path": "packages/", "maxResults": 10, "contextLines": 1 }
```

#### Scenario: Agent asks for a concise pattern search
- **WHEN** the agent calls `code_intel` with `action: "pattern"`, a search pattern, and a small `maxResults` value
- **THEN** the tool limits returned matches to the requested budget and reports omitted-match counts when more evidence exists

#### Scenario: Agent scopes pattern search to a package
- **WHEN** the agent calls `code_intel` with `action: "pattern"`, a search pattern, and `path: "packages/supi-lsp/"`
- **THEN** the tool searches only within that path and reports the applied scope in the summary

#### Scenario: Agent narrows semantic discovery to exported APIs
- **WHEN** the agent calls a discovery-oriented semantic action with `symbol`, `path`, and `exportedOnly`
- **THEN** the tool limits candidate resolution to matching exported symbols within that scope when such filtering is supported

#### Scenario: Agent uses `path` for a focused brief
- **WHEN** the agent calls `code_intel` with `action: "brief"` and `path: "packages/supi-lsp/"`
- **THEN** the tool treats `path` as the focus target rather than requiring an anchored `file` position

#### Scenario: Agent uses `file` for an anchored target
- **WHEN** the agent calls a semantic or anchored-brief action with `file`, `line`, and `character`
- **THEN** the tool treats `file` as the anchored source file for that exact position rather than as a generic scope field

#### Scenario: Agent prefixes a path with `@`
- **WHEN** the agent supplies `path` or `file` beginning with `@`
- **THEN** the tool normalizes the leading `@` before path resolution so the call behaves like pi's built-in path tools

#### Scenario: Agent omits refinement controls
- **WHEN** the agent calls any `code_intel` action without result-size controls
- **THEN** the tool uses token-efficient defaults rather than returning an unbounded dump

### Requirement: Tool descriptions or schema help SHALL include concise example calls
The tool description, parameter descriptions, or related prompt/schema help SHALL include a small set of representative flat-schema examples that show the intended call shape without bloating the system prompt.

#### Scenario: Agent needs an example for a focused brief
- **WHEN** the agent inspects the tool description or schema help for `code_intel`
- **THEN** it can see a concise example such as `{ "action": "brief", "path": "packages/supi-lsp/" }`

#### Scenario: Agent needs an example for anchored semantic analysis
- **WHEN** the agent inspects the tool description or schema help for `code_intel`
- **THEN** it can see a concise example using `file`, `line`, and `character` for actions such as `callers`, `callees`, or `affected`

### Requirement: Semantic actions SHALL resolve a concrete target before returning semantic results
For `callers`, `callees`, and `implementations`, the tool SHALL accept either an anchored target (`file`, `line`, and `character`) or a discovery input such as `symbol`. Public `line` and `character` parameters SHALL be 1-based and compatible with the existing `lsp` and `tree_sitter` tools; the implementation SHALL translate them to the 0-based LSP service API internally. If discovery input resolves to multiple plausible targets, the tool SHALL return a disambiguation result instead of silently merging or selecting one target. Disambiguation candidates SHALL include retry-ready `file`, 1-based `line`, and 1-based `character` values when available.

#### Scenario: Anchored semantic target
- **WHEN** the agent calls `code_intel` with `action: "callers"`, `file`, `line`, and `character`
- **THEN** the tool analyzes the symbol at that concrete position

#### Scenario: Ambiguous symbol discovery
- **WHEN** the agent calls `code_intel` with `action: "implementations"` and a `symbol` value that matches multiple declarations
- **THEN** the tool returns the matching candidate targets, including anchored coordinates where available, and asks for disambiguation instead of returning merged implementation results

### Requirement: Search and relationship actions SHALL use a consistent confidence vocabulary
Search and relationship actions SHALL label result confidence using a consistent four-mode vocabulary: `semantic`, `structural`, `heuristic`, or `unavailable`. The word `degraded` MAY appear as a short umbrella description for any non-semantic path, but user-visible labels and structured metadata SHOULD prefer one of the four explicit modes.

#### Scenario: Structural relationship result
- **WHEN** a relationship action succeeds through parser-backed or manifest-backed analysis without semantic confirmation
- **THEN** the result is labeled `structural` rather than `semantic` or `heuristic`

#### Scenario: No useful result available
- **WHEN** the requested analysis cannot be produced with useful confidence
- **THEN** the result is labeled `unavailable` and suggests the next best move when useful

### Requirement: `action: "callers"` SHALL return grouped caller results with confidence labeling
The system SHALL support `action: "callers"` to find call sites for a resolved symbol target and return results grouped by file with a summary. If semantic support is unavailable, the result SHALL clearly label any fallback output as `structural`, `heuristic`, or `unavailable` as appropriate and suggest the next best drill-down when useful.

#### Scenario: Semantic caller results available
- **WHEN** the agent calls `code_intel` with `action: "callers"` for a resolved target that has LSP reference data
- **THEN** the tool returns call sites grouped by file with file paths, line numbers, and a summary such as the number of callers and files affected

#### Scenario: Only heuristic fallback is available
- **WHEN** the agent calls `code_intel` with `action: "callers"` for a symbol in a context without usable LSP references but with fallback search matches
- **THEN** the tool returns the fallback matches labeled clearly as `heuristic` caller hints rather than `semantic` caller results
- **AND** it suggests the best next query or scope refinement when that would improve confidence

### Requirement: `action: "callees"` SHALL return grouped outgoing-call results with confidence labeling
The system SHALL support `action: "callees"` to find the most relevant outgoing calls made by a resolved symbol target and return results grouped by file or callee symbol with a summary. `callees` is a best-effort v1 action: when semantic relationship data is available it SHALL use it, and when it is not available it MAY fall back to structural or text-search hints. Non-semantic output SHALL be labeled clearly as `structural`, `heuristic`, or `unavailable` as appropriate and SHALL suggest the next best drill-down when useful.

#### Scenario: Semantic callee results available
- **WHEN** the agent calls `code_intel` with `action: "callees"` for a resolved target that has semantic relationship data available
- **THEN** the tool returns the main outgoing calls grouped and summarized with file paths, symbol names, and `semantic` confidence labeling

#### Scenario: Structural or heuristic callee fallback is available
- **WHEN** the agent calls `code_intel` with `action: "callees"` in a context without usable semantic relationship data but with structural or search-based hints
- **THEN** the tool returns the fallback matches labeled clearly as `structural` or `heuristic` callee hints rather than `semantic` outgoing-call results
- **AND** it suggests the best next query or scope refinement when that would improve confidence

### Requirement: `action: "implementations"` SHALL return implementation candidates with confidence labeling
The system SHALL support `action: "implementations"` to find concrete implementations of an interface, abstract type, or contract-like symbol. When the shared LSP service provides implementation-provider support, semantic results SHALL use that support. If semantic support is unavailable, any fallback results SHALL be labeled as `structural`, `heuristic`, or `unavailable` as appropriate and suggest the next best drill-down when useful.

#### Scenario: Semantic implementations available
- **WHEN** the agent calls `code_intel` with `action: "implementations"` for a resolved target and the shared LSP service supports implementation requests for that file
- **THEN** the tool returns concrete implementation results with file paths and symbol names

#### Scenario: Semantic support unavailable
- **WHEN** the agent calls `code_intel` with `action: "implementations"` for a resolved target without usable LSP implementation support
- **THEN** the tool either returns clearly labeled `structural` or `heuristic` implementation candidates, or a message labeled `unavailable`
- **AND** it suggests the best next query or scope refinement when that would improve confidence

### Requirement: `action: "pattern"` SHALL provide structured text search results
The system SHALL support `action: "pattern"` using text search and return results grouped by file with matching lines and nearby context.

#### Scenario: Pattern search with multiple matches
- **WHEN** the agent calls `code_intel` with `action: "pattern"` and a pattern that matches multiple files
- **THEN** the tool returns grouped matches with file paths, line numbers, matching lines, and nearby context plus a summary of total matches

#### Scenario: No pattern matches
- **WHEN** the agent calls `code_intel` with `action: "pattern"` and the pattern matches nothing
- **THEN** the tool returns a message indicating that no matches were found

### Requirement: Search and relationship output SHALL be summary-first, ranked, and bounded to pi output limits
The system SHALL return search and relationship output as structured markdown with a concise summary first, grouped evidence, confidence labels from the shared vocabulary (`semantic`, `structural`, `heuristic`, `unavailable`), and file/line references where available. Relationship-oriented actions SHALL surface a small ranked set of highest-value files, modules, or symbols before any long tail. It SHALL truncate oversized search output to fit pi output limits (50KB / 2000 lines) using the repository standard truncation helper where practical, and SHALL note when truncation occurred.

#### Scenario: Semantic result summary
- **WHEN** a `callers` or `implementations` action returns semantic results, or a `callees` action returns semantic results in contexts where semantic relationship data is available
- **THEN** the first lines summarize the number of files, matches, and confidence source before listing grouped evidence

#### Scenario: Ranked relationship result summary
- **WHEN** a `callers`, `callees`, or `implementations` action returns many candidate relationships
- **THEN** the tool surfaces a small ranked set of highest-value targets before any long tail or omitted-count note

#### Scenario: Very large search result
- **WHEN** a `callers`, `callees`, `implementations`, or `pattern` action produces output larger than pi's tool output limits
- **THEN** the tool truncates the output and includes a note that the result was truncated

#### Scenario: Long tail omitted by default budget
- **WHEN** a search action finds more matches than the default or requested result budget
- **THEN** the tool reports how many matches were omitted and suggests narrowing the query or raising the limit

### Requirement: Tool results SHALL expose structured details metadata in addition to markdown
In addition to markdown content for the model, search and relationship actions SHALL include compact structured `details` metadata suitable for tests, renderers, and future automation. Where applicable, `details` SHOULD include fields such as confidence mode from the shared vocabulary, applied scope, disambiguation candidates, omitted counts, and suggested next queries.

#### Scenario: Relationship result includes metadata
- **WHEN** a `callers`, `callees`, `implementations`, or `pattern` action succeeds
- **THEN** the tool result includes markdown content for the model and a compact `details` object describing the structured result
