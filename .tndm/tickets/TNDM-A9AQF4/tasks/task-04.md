# Task 4: Clean up code_* guidance to remove substrate tool cross-references

## Goal

Remove all references to `lsp_*` and `tree_sitter_*` tools from the `code_*` tool guidance. The model should only be directed to other `code_*` tools, not substrate tools.

## Files

### `packages/supi-code-intelligence/src/tool/guidance.ts`

Update `INTENT_GUIDELINES` for each tool:

**`code_brief`:**
- Remove: `"After code_brief, use lsp_hover/lsp_definition/lsp_references for deeper semantic detail or tree_sitter_* for quick structural context."`
- Add: `"After code_brief, use code_references for usages or code_calls for outgoing calls."`

**`code_references`:**
- Remove: `"Follow up with lsp_hover for type info on individual reference sites."`
- Add: `"Follow up with code_brief for type/definition info on individual reference sites."`

**`code_pattern`:**
- Remove: `"For structured or semantic precision, use tree_sitter_query or lsp_hover/lsp_definition instead."`
- Add: `"For structured or semantic precision, use code_resolve or code_brief instead."`

**Other tools** — review each guideline and remove any remaining `lsp_*` or `tree_sitter_*` references.

### `packages/supi-code-intelligence/src/lsp/guidance.ts` (header comment only)

Update the file header to note that this guidance is now library-only and not used for public tool registration:

```
// LSP tool guidance — prompt surfaces for lsp_* tools.
//
// NOTE: As of Phase 1.5, lsp_* tools are no longer registered on the public
// surface. This guidance is kept for library use (tests, internal tooling).
```

### `packages/supi-code-intelligence/src/tree-sitter/guidance.ts` (header comment only)

Same library-only note.

## Verification

```bash
# Search for remaining lsp_* and tree_sitter_* references in guidance
rg 'lsp_\w+|tree_sitter_\w+' packages/supi-code-intelligence/src/tool/guidance.ts
# Should return zero results

# Typecheck
pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json
```

No `lsp_*` or `tree_sitter_*` references should remain in `src/tool/guidance.ts`.
