## MODIFIED Requirements

### Requirement: Target path extraction from bash search commands
The system SHALL provide a function `extractSearchTargets(command: string): string[]` that parses common text-search command invocations (`rg`, `grep`, `ack`, `ag`, `git grep`) using a WASM-based bash AST parser (`web-tree-sitter` loading the bundled `tree-sitter-bash.wasm` artifact from the `tree-sitter-bash` package) and returns an array of file or directory path arguments found in the command string. The parser SHALL be initialized asynchronously at session start via a fire-and-forget pattern. If the parser is not yet ready, the function SHALL return `[]`. If parser initialization fails, the system SHALL log a warning and SHALL retry initialization in a later session instead of permanently disabling parsing for the process lifetime.

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

#### Scenario: Parser not yet initialized
- **WHEN** the WASM parser has not finished loading
- **THEN** `extractSearchTargets` returns `[]`

### Requirement: Soft nudge for semantic bash searches on LSP-supported files
The system SHALL provide a function `shouldSuggestLsp` that returns an informational nudge message when the agent runs a text-search command targeting LSP-supported files with a semantically motivated prompt. The system SHALL NOT block the bash command — the nudge is appended to the tool result as additional content. When checking directory targets, the system SHALL limit traversal to a maximum depth of 5 levels and 1000 files visited to prevent event-loop stalls in large repositories. When a subtree exceeds the depth limit, the system SHALL skip that subtree, log a warning, and continue scanning remaining candidate directories. When the global file budget is exhausted, the system SHALL stop the scan, log a warning, and return `false` for that target.

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

#### Scenario: Deep subtree is skipped without aborting shallow siblings
- **WHEN** a directory target contains a subtree that exceeds 5 levels of nesting
- **THEN** the system skips that subtree and continues scanning remaining candidate directories
- **AND** the system logs a warning about the skipped deep subtree

#### Scenario: Global file budget stops the scan
- **WHEN** a directory target requires scanning more than 1000 files
- **THEN** the system stops traversal and returns `false` for that target
- **AND** the system logs a warning about the exhausted file budget

#### Scenario: Parser not ready at nudge check time
- **WHEN** the WASM parser has not finished initializing
- **THEN** `shouldSuggestLsp` returns `null`

#### Scenario: Failed parser initialization is retried in a later session
- **WHEN** parser initialization fails in one session
- **THEN** the system logs a warning about the failed initialization
- **AND** a later session can retry parser initialization instead of reusing a permanently failed state
