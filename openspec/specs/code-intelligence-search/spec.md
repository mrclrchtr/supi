## ADDED Requirements

### Requirement: The system SHALL register a `code_intel` tool
The extension SHALL register a tool named `code_intel` with an `action` parameter supporting the values `brief`, `callers`, `callees`, `implementations`, `affected`, and `pattern`.

#### Scenario: Tool registration
- **WHEN** the extension loads successfully
- **THEN** the `code_intel` tool appears in the agent tool list with its supported actions documented in its description and prompt guidance

### Requirement: `code_intel` guidance SHALL make correct tool use obvious and attractive
The tool SHALL provide compact `promptSnippet` and `promptGuidelines` that explain when `code_intel` saves tokens or improves correctness compared with broad file reads, raw `rg`, or direct low-level tool use. Every prompt guideline SHALL explicitly name `code_intel` because pi flattens tool guidelines into the global `Guidelines:` section. Guidance SHOULD also make clear that `code_intel` is not preferred over direct file reads or lower-level tools for trivial, already-localized edits or exact drill-down tasks.

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

#### Scenario: Task is already localized and trivial
- **WHEN** the agent already has an obvious single-file edit or needs exact symbol/AST drill-down rather than summarized context
- **THEN** the guidance does not encourage unnecessary `code_intel` use and leaves direct reads or lower-level tools as the cheaper path

### Requirement: Tool guidance SHALL map common agent intents to canonical actions
Tool guidance, descriptions, or schema help SHALL map common agent intents to canonical `code_intel` actions in plain language so the agent does not have to infer the taxonomy. At minimum, guidance SHOULD make it obvious that “orient me” maps to `brief`, “who uses this?” maps to `callers`, “what does this call?” maps to `callees` for a quick best-effort outbound-call map in v1, “what breaks if I change this?” maps to `affected`, “find concrete implementations” maps to `implementations`, and bounded text search maps to `pattern`.

#### Scenario: Agent thinks in intent rather than tool vocabulary
- **WHEN** the agent needs architecture, usage, impact, implementation, or text-search help but has not yet chosen an action name
- **THEN** the tool guidance makes the correct action mapping obvious without requiring the agent to reason from first principles

### Requirement: Search and relationship results SHOULD avoid obvious low-signal paths by default
By default, `code_intel` SHOULD prioritize human-authored project sources and avoid obvious low-signal generated, build-output, vendored, dependency-output, or cache-like paths when practical. If the agent explicitly scopes a query to such a path, the tool MAY include those results normally.

#### Scenario: Source and generated matches both exist
- **WHEN** a query would return matches from both project source files and obvious generated/build/vendor outputs
- **THEN** the tool prioritizes source results and omits low-signal paths by default unless the agent explicitly scopes to them

#### Scenario: Agent explicitly scopes to a generated path
- **WHEN** the agent sets `path` to a generated, vendored, or build-output location
- **THEN** the tool respects that scope instead of filtering those results out

### Requirement: Tool parameters SHALL support token-efficient refinement
The `code_intel` parameter schema SHALL keep common calls short while allowing agents to bound result size intentionally. In addition to action-specific inputs (`path`, `symbol`, `file`, `line`, `character`, and search pattern), search-oriented actions SHOULD support optional result and context controls such as `maxResults` and `contextLines` with concrete token-efficient defaults. In v1, `pattern` SHOULD default to about `maxResults: 8` and `contextLines: 1`, while relationship actions SHOULD default to surfacing about five ranked targets and grouped evidence for about eight files unless the agent asks for more. Text-search and discovery-oriented actions SHOULD support a `path` scope when practical so agents can restrict analysis to a package, directory, or file instead of paying for whole-repository results. Discovery-oriented semantic actions SHOULD also support optional narrowing filters such as symbol `kind` and `exportedOnly` when those filters materially reduce ambiguity or token cost. In v1, `exportedOnly` is the canonical public-surface filter; a broader language-specific `publicOnly` concept is deferred.

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

#### Scenario: `exportedOnly` with LSP available
- **WHEN** the agent uses `exportedOnly` and LSP provides symbol visibility information
- **THEN** the tool filters candidates using LSP-provided visibility when available, or post-filters using Tree-sitter export detection on candidate files

#### Scenario: `exportedOnly` with structural-only analysis
- **WHEN** the agent uses `exportedOnly` and only Tree-sitter analysis is available
- **THEN** the tool filters candidates using the Tree-sitter `exports` action to check whether candidate symbols appear in the file's export list

#### Scenario: `exportedOnly` with text-search-only fallback
- **WHEN** the agent uses `exportedOnly` but neither LSP nor Tree-sitter can verify export status
- **THEN** the tool MAY silently ignore the filter and include a confidence note that export filtering was not applied

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

#### Scenario: Agent relies on predictable relationship budgets
- **WHEN** the agent calls a relationship action without a custom result limit
- **THEN** the tool returns a small ranked set of high-value targets and reports omitted counts instead of flooding the prompt with every match

### Requirement: Tool descriptions or schema help SHALL include concise example calls
The tool description, parameter descriptions, or related prompt/schema help SHALL include a small set of representative flat-schema examples that show the intended call shape without bloating the system prompt.

#### Scenario: Agent needs an example for a focused brief
- **WHEN** the agent inspects the tool description or schema help for `code_intel`
- **THEN** it can see a concise example such as `{ "action": "brief", "path": "packages/supi-lsp/" }`

#### Scenario: Agent needs an example for anchored semantic analysis
- **WHEN** the agent inspects the tool description or schema help for `code_intel`
- **THEN** it can see a concise example using `file`, `line`, and `character` for actions such as `callers`, `callees`, or `affected`

### Requirement: Semantic actions SHALL resolve a concrete target before returning semantic results
For `callers`, `callees`, and `implementations`, the tool SHALL accept either an anchored target (`file`, `line`, and `character`) or a discovery input such as `symbol`. Public `line` and `character` parameters SHALL be 1-based and compatible with the existing `lsp` and `tree_sitter` tools; the implementation SHALL translate them to the 0-based LSP service API internally. If discovery input resolves to multiple plausible targets, the tool SHALL return a disambiguation result instead of silently merging or selecting one target. Disambiguation candidates SHALL include retry-ready display name, kind, container/module when available, explicit rank order, `file`, 1-based `line`, 1-based `character`, and a short distinguishing reason or snippet. Candidate lists SHOULD be ranked, bounded by default, and report omitted counts when additional matches exist.

#### Scenario: Anchored semantic target
- **WHEN** the agent calls `code_intel` with `action: "callers"`, `file`, `line`, and `character`
- **THEN** the tool analyzes the symbol at that concrete position

#### Scenario: Ambiguous symbol discovery
- **WHEN** the agent calls `code_intel` with `action: "implementations"` and a `symbol` value that matches multiple declarations
- **THEN** the tool returns the matching candidate targets, including anchored coordinates where available, and asks for disambiguation instead of returning merged implementation results

### Requirement: Search and relationship actions SHALL use a consistent confidence vocabulary
Search and relationship actions SHALL label result confidence using a consistent four-mode vocabulary: `semantic`, `structural`, `heuristic`, or `unavailable`. The word `degraded` MAY appear as a short umbrella description for any non-semantic path, but user-visible labels and structured metadata SHOULD prefer one of the four explicit modes.

### Requirement: Search and relationship actions SHOULD prefer correct bounded results over latency-oriented partial responses in v1
Search and relationship actions SHOULD prefer the highest-confidence bounded result practical for the current target. In v1, correctness, token efficiency, and usable summaries take precedence over latency optimization. When semantic analysis is unavailable or unsupported, the tool SHOULD return the best correctly labeled `structural`, `heuristic`, or `unavailable` result it can. The tool MAY return an early bounded fallback while higher-confidence enrichment is still pending, but this is optional in v1 and SHOULD NOT be required purely for responsiveness.

#### Scenario: Semantic analysis is unavailable
- **WHEN** the agent calls `code_intel` for `callers`, `callees`, or `implementations` in a context where semantic analysis is unavailable or unsupported
- **THEN** the tool returns the best bounded structural, heuristic, or unavailable result with clear confidence labeling

#### Scenario: Semantic analysis is still pending
- **WHEN** semantic enrichment is still pending and a semantic answer is likely to materially improve correctness
- **THEN** the tool MAY wait for the higher-confidence result rather than returning an early partial answer purely for responsiveness

#### Scenario: Retry is unlikely to help
- **WHEN** the current fallback result already reflects the best practical confidence available for the project or language
- **THEN** the tool does not add a noisy retry suggestion

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

In v1, structural fallback for `callees` SHALL identify `call_expression` and `new_expression` AST nodes within the resolved symbol's body using Tree-sitter. It SHALL NOT include type references, import declarations, or non-invoked property accesses. This keeps structural callee output focused on actual invocations rather than noisy identifier mentions.

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
The system SHALL support `action: "pattern"` using line-oriented text search and return results grouped by file with matching lines and nearby context. In v1, `pattern` SHALL be interpreted as a search pattern evaluated by the underlying search engine within the optional `path` scope; the tool does not promise language-aware semantic matching for this action.

`pattern` is not a replacement for raw `rg` in shell scripts; it is a bounded, scope-aware, agent-friendly wrapper that provides: (1) structured markdown output grouped by file with match context, (2) `details` metadata with match counts, applied scope, and omitted counts for tests/automation, (3) automatic scope enforcement via `path`, default `maxResults` budget of ~8, and low-signal path filtering (node_modules, build outputs, generated artifacts), and (4) pi output-limit truncation with clear reporting. The value over raw `rg` is noise reduction, budget enforcement, and seamless integration with `code_intel` follow-up suggestions.

#### Scenario: Pattern search with multiple matches
- **WHEN** the agent calls `code_intel` with `action: "pattern"` and a pattern that matches multiple files
- **THEN** the tool returns grouped matches with file paths, line numbers, matching lines, and nearby context plus a summary of total matches

#### Scenario: No pattern matches
- **WHEN** the agent calls `code_intel` with `action: "pattern"` and the pattern matches nothing
- **THEN** the tool returns a message indicating that no matches were found

### Requirement: Strongly implied follow-up queries SHOULD be copyable
When disambiguation or next-step guidance strongly implies a follow-up `code_intel` query, the result SHOULD include a compact copyable rerun example with concrete parameter values.

#### Scenario: Disambiguation requires rerunning the same action
- **WHEN** a semantic action returns multiple candidate targets for disambiguation
- **THEN** the result includes a compact rerun example for at least one concrete candidate target

#### Scenario: A best next query is obvious
- **WHEN** the tool recommends a specific follow-up `code_intel` query
- **THEN** the result includes a compact copyable example with concrete parameter values when doing so materially reduces friction

### Requirement: Search and relationship output SHALL be summary-first, ranked, and bounded to pi output limits
The system SHALL return search and relationship output as structured markdown with a concise summary first, grouped evidence, confidence labels from the shared vocabulary (`semantic`, `structural`, `heuristic`, `unavailable`), and file/line references where available. Relationship-oriented actions SHALL surface a small ranked set of highest-value files, modules, or symbols before any long tail. Ranking SHOULD prefer direct symbol ties, public/exported surfaces, cross-module impact, likely edit surfaces, and nearby tests over low-signal or redundant matches. Output SHALL omit empty sections, avoid repeating boilerplate confidence explanations unless they change the agent's next step, and prefer ranked summaries over exhaustive dumps. It SHALL truncate oversized search output to fit pi output limits (50KB / 2000 lines) using the repository standard truncation helper where practical, and SHALL note when truncation occurred.

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

#### Scenario: Low-value sections would add noise
- **WHEN** a potential output section would be empty, redundant, or only restate already summarized information
- **THEN** the tool omits that section instead of rendering low-value boilerplate

### Requirement: Tool results SHALL expose structured details metadata in addition to markdown
In addition to markdown content for the model, search and relationship actions SHALL include compact structured `details` metadata suitable for tests, renderers, and future automation. Where applicable, `details` SHOULD include fields such as confidence mode from the shared vocabulary, applied scope, disambiguation candidates, omitted counts, and suggested next queries.

#### Scenario: Relationship result includes metadata
- **WHEN** a `callers`, `callees`, `implementations`, or `pattern` action succeeds
- **THEN** the tool result includes markdown content for the model and a compact `details` object describing the structured result

### Requirement: Parameter validation SHALL return actionable error messages
The `code_intel` tool SHALL validate input parameters per action and return clear, actionable error messages naming the specific violation and suggesting correct usage. Invalid or missing required inputs SHALL produce an error result rather than silently degrading.

#### Scenario: Unknown action value
- **WHEN** the agent calls `code_intel` with an unrecognized `action` value
- **THEN** the tool returns an error naming the invalid action and listing supported actions: `brief`, `callers`, `callees`, `implementations`, `affected`, `pattern`

#### Scenario: Anchored position without `file`
- **WHEN** the agent provides `line` and/or `character` without `file`
- **THEN** the tool returns an error: "`line` and `character` require `file`"

#### Scenario: `pattern` action without pattern string
- **WHEN** the agent calls `code_intel` with `action: "pattern"` but omits the `pattern` parameter
- **THEN** the tool returns an error: "`pattern` action requires a `pattern` parameter"

#### Scenario: Semantic action without target or discovery input
- **WHEN** the agent calls a semantic action (`callers`, `callees`, `implementations`, `affected`) without `file`+`line`+`character` AND without `symbol`
- **THEN** the tool returns an error explaining that semantic actions require either anchored coordinates or a `symbol` for discovery

#### Scenario: `file` points to a non-existent path
- **WHEN** the agent provides a `file` value that does not exist on disk
- **THEN** the tool returns an error naming the missing file path

#### Scenario: `file` points to an unsupported binary file
- **WHEN** the agent provides a `file` value pointing to a binary or unsupported file type for semantic analysis
- **THEN** the tool returns a clear message that the file type is not supported for semantic analysis and suggests `pattern` for text search if appropriate

#### Scenario: `path` vs `file` role mistake
- **WHEN** the agent provides `path` with `line`/`character` (suggesting they meant `file`) or provides `file` for a directory (suggesting they meant `path`)
- **THEN** the tool returns an error explaining the distinction: `path` scopes/focuses analysis; `file` anchors a position
