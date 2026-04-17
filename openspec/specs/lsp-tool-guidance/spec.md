# Capability: lsp-tool-guidance

## Purpose
TBD

## Requirements

### Requirement: LSP tool prompt visibility
The system SHALL register the `lsp` tool with a `promptSnippet` and `promptGuidelines` that make semantic navigation discoverable in pi's default system prompt.

#### Scenario: Tool guidance appears in the default prompt
- **WHEN** the `lsp` extension is loaded and the `lsp` tool is active
- **THEN** the tool contributes a one-line prompt snippet describing semantic code intelligence capabilities
- **AND** the tool contributes prompt guidelines telling the agent when to use the `lsp` tool

### Requirement: Semantic-first guidance for supported workflows
The `lsp` tool guidance SHALL instruct the agent to prefer `lsp` actions for symbol lookup, definitions, references, document symbols, hover, rename planning, code actions, and diagnostics in supported languages. When the agent runs a text-search command targeting LSP-supported files with a semantically motivated prompt, the system SHALL inject a soft informational nudge suggesting LSP — it SHALL NOT block the command. The system SHALL NOT nudge for searches targeting unsupported file types (e.g., `.md`, `.json`, `.yaml`).

#### Scenario: Agent needs symbol-oriented navigation
- **WHEN** the agent is deciding how to inspect a supported source file for definitions, references, symbols, or diagnostics
- **THEN** the prompt guidance tells it to prefer `lsp` over raw shell text search

#### Scenario: Agent needs semantic rename planning
- **WHEN** the agent needs to understand the impact of renaming a symbol in a supported language
- **THEN** the prompt guidance tells it to prefer `lsp` rename or references workflows before manual text search

#### Scenario: Soft nudge on semantic search for LSP-supported files
- **WHEN** the agent runs a text-search command targeting `.ts` files with an active TypeScript LSP server
- **AND** the prompt contains semantic keywords
- **THEN** an informational nudge suggesting the `lsp` tool is injected via a steer message
- **AND** the bash command is NOT blocked

#### Scenario: No nudge for non-LSP files
- **WHEN** the agent runs a text-search command targeting `.md` files (no configured LSP server)
- **AND** there is active LSP coverage for `.ts` files in the project
- **THEN** no nudge is injected — the tool result passes through unchanged

### Requirement: Guidance SHALL preserve fallback paths
The `lsp` tool guidance SHALL tell the agent to fall back to `bash` or file reads when LSP is unavailable, unsupported for the file type, or the task is plain-text rather than semantic code navigation.

#### Scenario: Unsupported file type
- **WHEN** the agent is working with a file type that has no configured or available LSP server
- **THEN** the prompt guidance allows fallback to non-LSP tools without implying that LSP is required

#### Scenario: Text search outside semantic workflows
- **WHEN** the task is to search docs, config files, string literals, or other non-symbol text patterns
- **THEN** the prompt guidance allows `bash`-based search instead of forcing `lsp`
