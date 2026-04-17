## ADDED Requirements

### Requirement: Target path extraction from bash search commands
The system SHALL provide a function `extractSearchTargets(command: string): string[]` that parses common text-search command invocations (`rg`, `grep`, `ack`, `ag`, `git grep`) and returns an array of file or directory path arguments found in the command string.

#### Scenario: rg with file arguments
- **WHEN** the command is `rg "pattern" src/foo.ts lib/bar.ts`
- **THEN** `extractSearchTargets` returns `["src/foo.ts", "lib/bar.ts"]`

#### Scenario: grep with directory argument
- **WHEN** the command is `grep -r "pattern" openspec/changes/`
- **THEN** `extractSearchTargets` returns `["openspec/changes/"]`

#### Scenario: rg with flags only and no file target
- **WHEN** the command is `rg "pattern"` (no explicit path)
- **THEN** `extractSearchTargets` returns `[]`

#### Scenario: git grep with pathspec
- **WHEN** the command is `git grep "pattern" -- packages/supi-lsp/`
- **THEN** `extractSearchTargets` returns `["packages/supi-lsp/"]`

#### Scenario: unparseable or unsupported command
- **WHEN** the command is a search tool invocation that does not match known patterns
- **THEN** `extractSearchTargets` returns `[]`

### Requirement: Soft nudge for semantic bash searches on LSP-supported files
The system SHALL provide a function `shouldSuggestLsp` that returns an informational nudge message when the agent runs a text-search command targeting LSP-supported files with a semantically motivated prompt. The system SHALL NOT block the bash command — the nudge is appended to the tool result as additional content.

#### Scenario: Semantic grep on TypeScript files with LSP active
- **WHEN** the agent runs `rg "pattern" packages/supi-lsp/` targeting `.ts` files
- **AND** the prompt contains semantic keywords (definitions, references, symbols, etc.)
- **AND** the TypeScript LSP server is available for those files
- **THEN** `shouldSuggestLsp` returns a brief informational nudge message

#### Scenario: Semantic grep on markdown files with LSP active for TypeScript
- **WHEN** the agent runs `rg "pattern" openspec/changes/` targeting `.md` files
- **AND** the prompt contains semantic keywords
- **AND** the TypeScript LSP server is active for nearby `.ts` files
- **THEN** `shouldSuggestLsp` returns `null` (no nudge) because `.md` files have no LSP server

#### Scenario: Non-semantic prompt
- **WHEN** the agent runs `rg "TODO" src/`
- **AND** the prompt does not contain semantic keywords
- **THEN** `shouldSuggestLsp` returns `null` regardless of LSP coverage

#### Scenario: No extractable targets
- **WHEN** the agent runs a search command from which no targets can be parsed
- **THEN** `shouldSuggestLsp` returns `null` (skip nudge when targets are unknown)
