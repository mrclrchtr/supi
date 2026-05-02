## ADDED Requirements

### Requirement: Tree-sitter tool prompt guidance SHALL be standalone-safe
The system SHALL phrase `tree_sitter` prompt guidance so the package remains correct and self-contained when installed by itself. The guidance MAY distinguish structural analysis from semantic language-server analysis, but it SHALL NOT instruct the agent to use an unavailable `lsp` tool by name when that tool is not part of the current install.

#### Scenario: Standalone tree-sitter install
- **WHEN** `supi-tree-sitter` is installed without `supi-lsp`
- **THEN** the `tree_sitter` tool prompt guidance explains the structural-analysis role of the tool
- **AND** it does not refer to a missing `lsp` tool as if it were available

#### Scenario: Full stack install
- **WHEN** `supi-tree-sitter` and `supi-lsp` are both installed
- **THEN** the `tree_sitter` tool prompt guidance can distinguish structural syntax-tree analysis from semantic language-server analysis
- **AND** it still presents `tree_sitter` as independently usable rather than dependent on `lsp`
