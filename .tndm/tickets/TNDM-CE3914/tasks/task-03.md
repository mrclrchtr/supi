# Task 3: Update CLAUDE.md to reflect absorption status

## Goal

Update CLAUDE.md to reflect that both `lsp_hover` and `lsp_code_actions` are now absorbed.

## Files

- `packages/supi-code-intelligence/CLAUDE.md`

## Changes

1. Update the "V2 workflow — Phase 1.5" section:
   - Remove the line that says "Phase 2 absorbs lsp_hover into code_brief (anchored mode) as best-effort LSP type/signature info"
   - Replace with: "`lsp_hover` is absorbed by `code_brief` anchored mode (best-effort LSP type/signature info)."

2. Remove or update the "Known absorption gaps" section:
   - Remove `lsp_code_actions` entry — now absorbed by `code_health` detailed mode
   - Keep `lsp_definition` entry (still partially absorbed — exact go-to-definition across files not surfaced as a standalone capability)
   - If only `lsp_definition` remains, rename section to "Known absorption gap" (singular)

## Verification

- CLAUDE.md no longer says "Phase 2 absorbs lsp_hover"
- CLAUDE.md no longer lists lsp_code_actions as an unabsorbed gap
- lsp_definition partial absorption is still documented
