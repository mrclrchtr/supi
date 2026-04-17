## MODIFIED Requirements

### Requirement: Semantic-first guidance for supported workflows
The `lsp` tool guidance SHALL instruct the agent to prefer `lsp` actions for symbol lookup, definitions, references, document symbols, hover, rename planning, code actions, and diagnostics in supported languages. When the agent runs a text-search command targeting LSP-supported files with a semantically motivated prompt, the system SHALL append a soft informational nudge to the tool result suggesting LSP — it SHALL NOT block the command. The system SHALL NOT nudge for searches targeting unsupported file types (e.g., `.md`, `.json`, `.yaml`).

#### Scenario: Agent needs symbol-oriented navigation
- **WHEN** the agent is deciding how to inspect a supported source file for definitions, references, symbols, or diagnostics
- **THEN** the prompt guidance tells it to prefer `lsp` over raw shell text search

#### Scenario: Agent needs semantic rename planning
- **WHEN** the agent needs to understand the impact of renaming a symbol in a supported language
- **THEN** the prompt guidance tells it to prefer `lsp` rename or references workflows before manual text search

#### Scenario: Soft nudge on semantic search for LSP-supported files
- **WHEN** the agent runs a text-search command targeting `.ts` files with an active TypeScript LSP server
- **AND** the prompt contains semantic keywords
- **THEN** an informational nudge suggesting the `lsp` tool is appended to the bash tool result
- **AND** the bash command is NOT blocked

#### Scenario: No nudge for non-LSP files
- **WHEN** the agent runs a text-search command targeting `.md` files (no configured LSP server)
- **AND** there is active LSP coverage for `.ts` files in the project
- **THEN** no nudge is appended — the tool result passes through unchanged
