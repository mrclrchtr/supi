## REMOVED Requirements

### Requirement: Target path extraction from bash search commands
**Reason**: The TreeSitter-based bash parser, `web-tree-sitter` dependency, and `tree-sitter-bash` dependency are removed entirely. The bash-guard infrastructure existed solely to support the steer nudge, which is deleted.
**Migration**: None. Agents receive LSP preference guidance through `promptGuidelines` in the system prompt.

### Requirement: Soft nudge for semantic bash searches on LSP-supported files
**Reason**: The `sendMessage`/`deliverAs: "steer"` nudge injected user-role messages that confused agents, wasted tokens, and triggered extra LLM turns. Project-specific `promptGuidelines` replace this with zero-cost system prompt guidance.
**Migration**: `promptGuidelines` contain server-specific capability information and "Prefer lsp over bash for semantic code navigation" as a guideline.
