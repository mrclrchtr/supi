# Task 8: Update docs + downstream references for LSP splits

**`packages/supi-lsp/CLAUDE.md`:**
- Replace all mentions of `lsp_lookup` → 4 tool names, `lsp_refactor` → 2 tool names
- Update the tool surface listing (L6-12): list all 10 tools instead of 6
- Update tool action gotchas section: replace `lsp_lookup` / `lsp_refactor` validation notes with per-tool notes
- Update the "Key files" section to reflect new tool count
- Update the "Diagnostic behavior gotchas" section if it mentions specific tool names

**`packages/supi-debug/src/status-log.ts`:**
- Replace `"lsp_lookup"` with `"lsp_hover"`, `"lsp_definition"`, `"lsp_references"`, `"lsp_implementation"`
- Replace `"lsp_refactor"` with `"lsp_rename"`, `"lsp_code_actions"`

**`packages/supi-code-intelligence/src/actions/callees-action.ts`:**
- Replace guidance strings referencing `lsp_lookup` with `lsp_hover`:
  - Line ~67: `'Use \`lsp_lookup\`...'` → `'Use \`lsp_hover\`...'`
  - Line ~101: same
  - Line ~116: same
  - Line ~147: same
