# Archive

# TNDM-QG0XNX — Close Verification

## Summary

Split three mega-tools (tree_sitter, lsp_lookup, lsp_refactor) into 12 focused single-purpose tools. All work was committed under adjacent refactoring tickets (TNDM-GKYTV2, TNDM-D7KHN3) but the formal close step was skipped.

## Task completion evidence

**Tasks 1-3 (tree_sitter split):**
- 6 focused tools registered with individual TypeBox schemas: `tree_sitter_outline`, `tree_sitter_imports`, `tree_sitter_exports`, `tree_sitter_node_at`, `tree_sitter_query`, `tree_sitter_callees`
- Verified in `packages/supi-code-intelligence/src/tree-sitter/tool-specs.ts` and `packages/supi-code-intelligence/src/tree-sitter/register-tools.ts`

**Tasks 4-8 (LSP split):**
- 4 focused LSP lookup tools: `lsp_hover`, `lsp_definition`, `lsp_references`, `lsp_implementation`
- 2 focused LSP refactor tools: `lsp_rename`, `lsp_code_actions`
- Plus 4 already-focused tools (document_symbols, workspace_symbols, diagnostics, recover)
- Verified in `packages/supi-code-intelligence/src/lsp/tool-specs.ts` (10 tool constants, no `action`/`kind` params)
- Parameter schema for `lsp_rename` uses `NewNameParam` (TypeBox-enforced required field)

**Task 9 (workspace verification):**
- Working tree is clean — `git status` reports no uncommitted changes
- All tools are individually registered with per-tool TypeBox schemas
- No mega-tools with `action` or `kind` multiplexing remain in the code-intelligence tool surface
