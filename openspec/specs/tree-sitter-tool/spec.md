## ADDED Requirements

### Requirement: The system SHALL register a `tree_sitter` tool
The extension SHALL register a tool named `tree_sitter` for direct agent use. The tool SHALL accept an `action` parameter with the values `outline`, `imports`, `exports`, `node_at`, and `query`.

#### Scenario: Tool registration
- **WHEN** the extension loads successfully
- **THEN** the `tree_sitter` tool appears in the agent's available tool list with the supported actions documented in its description and prompt guidance

### Requirement: Tool actions SHALL validate required parameters
The `tree_sitter` tool SHALL validate action-specific parameters before attempting execution.
- `action` is required and must be one of `outline`, `imports`, `exports`, `node_at`, and `query`
- `outline` requires `file`
- `imports` requires `file`
- `exports` requires `file`
- `node_at` requires `file`, positive integer `line`, and positive integer `character`
- `query` requires `file` and non-empty `query`

#### Scenario: Missing action parameter
- **WHEN** the agent calls `tree_sitter` without an `action`
- **THEN** the tool returns a validation error indicating that `action` is required and lists the supported actions

#### Scenario: Unknown action parameter
- **WHEN** the agent calls `tree_sitter` with `action: "parse"`
- **THEN** the tool returns a validation error indicating that the action is unsupported and lists the supported actions

#### Scenario: Missing file parameter
- **WHEN** the agent calls `tree_sitter` with `action: "outline"` and no `file`
- **THEN** the tool returns a validation error indicating that `file` is required

#### Scenario: Missing position parameter
- **WHEN** the agent calls `tree_sitter` with `action: "node_at"`, a `file`, and a `line` but no `character`
- **THEN** the tool returns a validation error indicating that `character` is required

#### Scenario: Invalid public coordinates
- **WHEN** the agent calls `tree_sitter` with `action: "node_at"`, a `file`, `line: 0`, and `character: -1`
- **THEN** the tool returns a validation error indicating that `line` and `character` must be positive 1-based integer values

#### Scenario: Invalid query syntax
- **WHEN** the agent calls `tree_sitter` with `action: "query"` and malformed Tree-sitter query syntax
- **THEN** the tool returns a validation error indicating that the query is invalid and includes the parser error message when available

### Requirement: Tool file paths SHALL resolve from the session working directory
The `tree_sitter` tool SHALL resolve relative `file` inputs from the current pi/session working directory and SHALL return clear file access errors when a requested file is missing or unreadable.

#### Scenario: Relative file input
- **WHEN** the agent calls `tree_sitter` with `action: "outline"` and `file: "src/example.ts"` from a session rooted at `/repo`
- **THEN** the tool reads `/repo/src/example.ts`
- **AND** the response identifies the requested or resolved file path

#### Scenario: Missing file input
- **WHEN** the agent calls `tree_sitter` with `action: "imports"` for `src/missing.ts`
- **THEN** the tool returns a file access error instead of an uncaught exception

### Requirement: Tool coordinates SHALL match the existing user-facing position convention
The `tree_sitter` tool SHALL accept and return 1-based `line` and `character` values compatible with the existing `lsp` tool. The public `character` value SHALL be interpreted as a UTF-16 code-unit column, and the tool SHALL NOT expose Tree-sitter byte columns in agent-facing output.

#### Scenario: Agent requests node lookup using lsp-compatible coordinates
- **WHEN** the agent calls `tree_sitter` with `action: "node_at"`, `line: 10`, and `character: 5`
- **THEN** the tool interprets the request as 1-based editor/LSP-compatible coordinates
- **AND** the returned node range is also 1-based

#### Scenario: Agent reuses a returned range
- **WHEN** the tool returns a range from `outline`, `imports`, `exports`, `node_at`, or `query`
- **THEN** the range can be used directly by an agent as a human-readable file reference and translated consistently with other SuPi tool outputs

### Requirement: The tool SHALL route each action to the shared runtime services
The tool SHALL implement its action handlers by calling the package's shared Tree-sitter runtime and structural extraction services rather than maintaining separate parsing logic.

#### Scenario: Outline action uses shared service
- **WHEN** the agent calls `tree_sitter` with `action: "outline"` for a supported file
- **THEN** the tool uses the shared parse and outline services to produce the response

#### Scenario: Exports action uses shared service
- **WHEN** the agent calls `tree_sitter` with `action: "exports"` for a supported file
- **THEN** the tool uses the shared parse and export extraction services to produce the response

#### Scenario: Query action uses shared service
- **WHEN** the agent calls `tree_sitter` with `action: "query"` for a supported file
- **THEN** the tool uses the shared parse and query services to produce the response

### Requirement: Tool responses SHALL be bounded and report truncation
The `tree_sitter` tool SHALL cap large agent-facing result sets to a maximum of **100 items per result type** and include an explicit truncation notice when additional outline items, imports, exports, query captures, or node context entries are omitted.

#### Scenario: Query returns many captures
- **WHEN** the agent calls `tree_sitter` with `action: "query"` and the query matches more captures than the tool response limit
- **THEN** the tool returns only the capped number of captures
- **AND** the response states that additional captures were omitted

#### Scenario: Large generated file outline
- **WHEN** the agent calls `tree_sitter` with `action: "outline"` for a supported generated file with more declarations than the tool response limit
- **THEN** the tool returns a compact capped outline
- **AND** the response states that additional outline items were omitted

### Requirement: Unsupported-language responses SHALL surface directly through the tool
If the runtime reports that a file's language is unsupported, the tool SHALL return that unsupported-language result directly and SHALL NOT fall back to regex, grep, or LSP.

#### Scenario: Unsupported language via tool
- **WHEN** the agent calls `tree_sitter` with `action: "imports"` for `main.py`
- **THEN** the tool returns a clear unsupported-language result for `main.py`

### Requirement: Tree-sitter tool prompt guidance SHALL be standalone-safe
The system SHALL phrase `tree_sitter` prompt guidance so the package remains correct and self-contained when installed by itself. The guidance MAY distinguish structural analysis from semantic language-server analysis generically or conditionally, but it SHALL NOT name the `lsp` tool as an available sibling tool.

#### Scenario: Standalone tree-sitter install
- **WHEN** `supi-tree-sitter` is installed without `supi-lsp`
- **THEN** the `tree_sitter` tool prompt guidance explains the structural-analysis role of the tool
- **AND** it does not name a missing `lsp` tool as if it were available

#### Scenario: Full stack install
- **WHEN** `supi-tree-sitter` and `supi-lsp` are both installed
- **THEN** the `tree_sitter` tool prompt guidance can distinguish structural syntax-tree analysis from semantic language-server analysis
- **AND** it still presents `tree_sitter` as independently usable rather than dependent on `lsp`
