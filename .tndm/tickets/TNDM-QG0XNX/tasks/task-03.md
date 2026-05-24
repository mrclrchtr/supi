# Task 3: Update docs + downstream references for tree_sitter split

**`packages/supi-tree-sitter/CLAUDE.md`:**
- Replace the "single source of truth for the public `tree_sitter` tool" language with focused-tool description
- Update the tool contract section: list all 6 tools with their signatures, language scopes, and when to use each
- Update the "Key files" section for the new `tool/register-tools.ts`
- Update the "Layering" section if it mentions `tree_sitter` as a single tool

**`packages/supi-debug/src/status-log.ts`:**
- Replace `"tree_sitter"` with the 6 new tool names in `EXPECTED_SUPI_TOOLS`

**`packages/supi-tree-sitter/CLAUDE.md` — guidance test update:**
- The guidance.test.ts already tests prompt guidance text — ensure it passes with new tool names
