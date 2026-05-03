## MODIFIED Requirements

### Requirement: Tool parameters SHALL support token-efficient refinement
The `code_intel` parameter schema SHALL keep common calls short while allowing agents to bound result size intentionally. In addition to action-specific inputs (`path`, `symbol`, `file`, `line`, `character`, and search pattern), search-oriented actions SHOULD support optional result and context controls such as `maxResults` and `contextLines` with concrete token-efficient defaults. In v1, `pattern` SHOULD default to about `maxResults: 8` and `contextLines: 1`, and SHALL treat `pattern` as a literal text search by default. `pattern` SHALL also support an optional `regex` boolean parameter; when `regex: true`, the tool SHALL interpret the supplied `pattern` using the underlying search engine's regex semantics. Relationship actions SHOULD default to surfacing about five ranked targets and grouped evidence for about eight files unless the agent asks for more. Text-search and discovery-oriented actions SHOULD support a `path` scope when practical so agents can restrict analysis to a package, directory, or file instead of paying for whole-repository results. Discovery-oriented semantic actions SHOULD also support optional narrowing filters such as symbol `kind` and `exportedOnly` when those filters materially reduce ambiguity or token cost. In v1, `exportedOnly` is the canonical public-surface filter; a broader language-specific `publicOnly` concept is deferred.

The schema SHALL remain flat and role-oriented:
- `path` scopes or focuses analysis to a package, directory, or file path
- `file` anchors a concrete location and SHOULD usually be paired with `line` and `character`
- `symbol` is for semantic discovery when the exact location is not yet known
- `pattern` is reserved for the text-search action and SHALL NOT double as a generic symbol query field
- `regex` enables regex semantics for `action: "pattern"`; when omitted or false, `pattern` SHALL be treated as a literal string
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
{ "action": "pattern", "pattern": "register(Settings|Config)", "path": "packages/", "regex": true, "maxResults": 10, "contextLines": 1 }
```

#### Scenario: Agent asks for a concise pattern search
- **WHEN** the agent calls `code_intel` with `action: "pattern"`, a search pattern, and a small `maxResults` value
- **THEN** the tool limits returned matches to the requested budget and reports omitted-match counts when more evidence exists

#### Scenario: Agent scopes pattern search to a package
- **WHEN** the agent calls `code_intel` with `action: "pattern"`, a search pattern, and `path: "packages/supi-lsp/"`
- **THEN** the tool searches only within that path and reports the applied scope in the summary

#### Scenario: Agent uses literal pattern search with regex metacharacters
- **WHEN** the agent calls `code_intel` with `action: "pattern"` and `pattern: "sendMessage({"` without `regex: true`
- **THEN** the tool treats the value as a literal string instead of a regex
- **AND** it returns literal matches when they exist rather than failing because of regex syntax

#### Scenario: Agent opts into regex search
- **WHEN** the agent calls `code_intel` with `action: "pattern"`, a regex pattern, and `regex: true`
- **THEN** the tool evaluates the supplied pattern using the underlying search engine's regex semantics

#### Scenario: Agent provides malformed regex input
- **WHEN** the agent calls `code_intel` with `action: "pattern"`, `regex: true`, and an invalid regex pattern
- **THEN** the tool returns an explicit invalid-regex error
- **AND** it does not report the failure as a normal no-match result

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
The tool description, parameter descriptions, or related prompt/schema help SHALL include a small set of representative flat-schema examples that show the intended call shape without bloating the system prompt. When `action: "pattern"` supports both literal-default searches and opt-in regex searches, the help SHALL make both modes discoverable with concise examples.

#### Scenario: Agent needs an example for a focused brief
- **WHEN** the agent inspects the tool description or schema help for `code_intel`
- **THEN** it can see a concise example such as `{ "action": "brief", "path": "packages/supi-lsp/" }`

#### Scenario: Agent needs an example for anchored semantic analysis
- **WHEN** the agent inspects the tool description or schema help for `code_intel`
- **THEN** it can see a concise example using `file`, `line`, and `character` for actions such as `callers`, `callees`, or `affected`

#### Scenario: Agent needs a regex pattern example
- **WHEN** the agent inspects the tool description or schema help for `code_intel`
- **THEN** it can see a concise `pattern` example that includes `regex: true`

### Requirement: `action: "pattern"` SHALL provide structured text search results
The system SHALL support `action: "pattern"` using line-oriented text search and return results grouped by file with matching lines and nearby context. By default, the public `pattern` value SHALL be treated as a literal string search within the optional `path` scope. When the agent sets `regex: true`, the tool SHALL evaluate `pattern` using the underlying search engine's regex semantics. The tool does not promise language-aware semantic matching for this action.

`pattern` is not a replacement for raw `rg` in shell scripts; it is a bounded, scope-aware, agent-friendly wrapper that provides: (1) structured markdown output grouped by file with match context, (2) `details` metadata with match counts, applied scope, and omitted counts for tests/automation, (3) automatic scope enforcement via `path`, default `maxResults` budget of ~8, and low-signal path filtering (node_modules, build outputs, generated artifacts), and (4) pi output-limit truncation with clear reporting. The value over raw `rg` is noise reduction, budget enforcement, and seamless integration with `code_intel` follow-up suggestions. When multiple nearby matches in the same file produce overlapping context windows, the rendered output SHALL avoid repeating identical `file:line` evidence more than once. When `regex: true` is used, invalid regex syntax SHALL be surfaced as an explicit error instead of a normal empty-result response.

#### Scenario: Pattern search with multiple matches
- **WHEN** the agent calls `code_intel` with `action: "pattern"` and a pattern that matches multiple files
- **THEN** the tool returns grouped matches with file paths, line numbers, matching lines, and nearby context plus a summary of total matches

#### Scenario: No pattern matches
- **WHEN** the agent calls `code_intel` with `action: "pattern"` and the pattern matches nothing
- **THEN** the tool returns a message indicating that no matches were found

#### Scenario: Nearby matches have overlapping context
- **WHEN** two or more pattern matches in the same file have overlapping context windows
- **THEN** the rendered result shows each `file:line` evidence line at most once
- **AND** it still preserves the grouped file summary and all distinct matched lines
