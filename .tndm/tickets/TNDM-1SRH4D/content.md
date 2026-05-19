## Approved Design

**Problem**: The guidance for `packages/supi-lsp/`, `packages/supi-tree-sitter/`, and `packages/supi-code-intelligence/` is too long and includes non-essential steering.

**Approach**: Rewrite the tool-facing guidance surfaces to be lean and decision-oriented.

- `packages/supi-lsp/src/guidance.ts`
  - keep only essential usage guidance
  - replace the current long bullets with a compact pseudocode block that clearly maps questions to the right LSP action
  - keep only diagnostics guidance that is strictly necessary for correct tool use
- `packages/supi-tree-sitter/src/tree-sitter.ts`
  - reduce `promptGuidelines` to only structural/AST usage guidance
  - rewrite the pseudocode block so it clearly maps question types to `outline`, `imports`, `exports`, `node_at`, `query`, and `callees`
  - do not mention other extensions/tools
- `packages/supi-code-intelligence/src/guidance.ts`
  - rewrite the router-style pseudocode so it is the most informative of the three
  - make it explicit when to use `code_intel` vs `lsp` vs `tree_sitter` vs plain file/text tools
  - aggressively remove non-essential prose around it
- update tests in:
  - `packages/supi-lsp/__tests__/guidance.test.ts`
  - `packages/supi-tree-sitter/__tests__/tool.test.ts`
  - `packages/supi-code-intelligence/__tests__/integration.test.ts`

**Why**: This keeps the guidance minimal while making tool selection clearer.

**Constraints / non-goals**:
- no unrelated refactors
- no behavior changes to the tools themselves
- focus on guidance, snippets, descriptions, and tests only

**Classification**: non-trivial, multi-package change
