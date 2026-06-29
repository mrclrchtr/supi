# Task 6: Update CLAUDE.md for Phase 1.5 substrate removal and code_health

## Goal

Update `CLAUDE.md` to reflect the Phase 1.5 state: substrate tools removed from public surface, code_health added.

## Files

### `packages/supi-code-intelligence/CLAUDE.md`

**Remove or replace this note:**
```
- Do **not** remove public `lsp_*` or `tree_sitter_*` tools until `code_context`, `code_find`,
  `code_graph`, `code_refactor`/`code_apply`, and `code_health` provide the intended replacements.
```
Replace with:
```
- Public `lsp_*` and `tree_sitter_*` tools are removed as of Phase 1.5.
  Their capabilities are absorbed by the code_* tool surface:
  lsp_hover/definition → code_resolve/code_brief, lsp_references → code_references,
  lsp_diagnostics/lsp_recover → code_health, tree_sitter_* → code_brief/code_calls.
  The LSP and tree-sitter libraries remain as internal substrates.
```

**Update public tool contracts section:**
- Add `code_health` section between `code_pattern` and `code_refactor_plan`:
```markdown
### `code_health`
Diagnostic health summary. Replaces `lsp_diagnostics` and `lsp_recover`.
- `scope?` — filter to a file or package path
- `refresh?` — recover stale diagnostics before checking
- `include?` — sections: diagnostics, servers, dirty
- `level?` — summary (counts) vs detailed (per-file)
```

**Update the first paragraph:**
Change from listing 9 tools to 10 tools (add code_health).

**Update architecture diagram header comment:**
Change "registers the focused tool surface" to mention the current tool count.

## Verification

```bash
# Check for obvious contradictions
rg 'lsp_\w+|tree_sitter_\w+' packages/supi-code-intelligence/CLAUDE.md
# Should only appear in the historical note or tool contracts explanation, not as active surface guidance
```
