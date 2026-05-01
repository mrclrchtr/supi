## ADDED Requirements

### Requirement: The system SHALL register a `tree_sitter` tool
The extension SHALL register a tool named `tree_sitter` for direct agent use. The tool SHALL accept an `action` parameter with the values `outline`, `imports`, `node_at`, and `query`.

#### Scenario: Tool registration
- **WHEN** the extension loads successfully
- **THEN** the `tree_sitter` tool appears in the agent's available tool list with the supported actions documented in its description and prompt guidance

### Requirement: Tool actions SHALL validate required parameters
The `tree_sitter` tool SHALL validate action-specific parameters before attempting execution.
- `outline` requires `file`
- `imports` requires `file`
- `node_at` requires `file`, `line`, and `character`
- `query` requires `file` and `query`

#### Scenario: Missing file parameter
- **WHEN** the agent calls `tree_sitter` with `action: "outline"` and no `file`
- **THEN** the tool returns a validation error indicating that `file` is required

#### Scenario: Missing position parameter
- **WHEN** the agent calls `tree_sitter` with `action: "node_at"`, a `file`, and a `line` but no `character`
- **THEN** the tool returns a validation error indicating that `character` is required

### Requirement: The tool SHALL route each action to the shared runtime services
The tool SHALL implement its action handlers by calling the package's shared Tree-sitter runtime and structural extraction services rather than maintaining separate parsing logic.

#### Scenario: Outline action uses shared service
- **WHEN** the agent calls `tree_sitter` with `action: "outline"` for a supported file
- **THEN** the tool uses the shared parse and outline services to produce the response

#### Scenario: Query action uses shared service
- **WHEN** the agent calls `tree_sitter` with `action: "query"` for a supported file
- **THEN** the tool uses the shared parse and query services to produce the response

### Requirement: Unsupported-language responses SHALL surface directly through the tool
If the runtime reports that a file's language is unsupported, the tool SHALL return that unsupported-language result directly and SHALL NOT fall back to regex, grep, or LSP.

#### Scenario: Unsupported language via tool
- **WHEN** the agent calls `tree_sitter` with `action: "imports"` for `main.py`
- **THEN** the tool returns a clear unsupported-language result for `main.py`
