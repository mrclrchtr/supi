# Task 4: Update CLAUDE.md: fix architecture diagram + document absorption gaps

## Goal

Update `packages/supi-code-intelligence/CLAUDE.md`:

### 1. Fix architecture diagram (lines ~44-45)

Change:
```
├── lsp/                    # LSP tool actions, specs, guidance, lifecycle, diagnostics
├── tree-sitter/            # TS tool actions, specs, guidance, execute, format, lifecycle
```
To:
```
├── lsp/                    # LSP lifecycle, diagnostics, settings, tool overrides, workspace recovery
├── tree-sitter/            # Tree-sitter session lifecycle (substrate only)
```

### 2. Document absorption gaps

Add a subsection under "V2 workflow — Phase 1.5" called "Known absorption gaps":

```markdown
### Known absorption gaps

- **lsp_hover**: type/signature hover info is not currently absorbed by any code_* tool. `code_brief` (anchored) shows tree-sitter node info and enclosing symbols but no LSP hover data. Planned for a future phase (likely `code_context` or `code_inspect`).
- **lsp_code_actions**: code action suggestions are deferred. No code_* tool surfaces them yet.
- **lsp_definition**: partially absorbed by `code_resolve` (resolves to target) and `code_brief` (shows enclosing symbol), but exact go-to-definition results across files are not surfaced.
```

## Verification

- Manual read-through confirms architecture diagram paths match reality
- Absorption gap section is accurate and located under Phase 1.5

