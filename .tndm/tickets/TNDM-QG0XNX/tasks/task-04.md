# Task 4: [TDD RED] Write failing tests for 6 focused LSP tools (hover, definition, references, implementation, rename, code_actions)

New test file `__tests__/unit/focused-tools.test.ts` that:

1. **Six focused tools are registered with correct metadata:**
   - All 6 tools: `lsp_hover`, `lsp_definition`, `lsp_references`, `lsp_implementation`, `lsp_rename`, `lsp_code_actions`
   - Each has `label`, `description`, `promptSnippet`, `promptGuidelines`, `parameters`
   - `lsp_lookup` and `lsp_refactor` are NOT registered
   - `lsp_document_symbols`, `lsp_workspace_symbols`, `lsp_diagnostics`, `lsp_recover` still registered (unchanged)

2. **Per-tool schemas are correct:**
   - `lsp_hover`/`lsp_definition`/`lsp_references`/`lsp_implementation`: `{ file, line: minimum 1, character: minimum 1 }` — no `kind`
   - `lsp_rename`: `{ file, line: minimum 1, character: minimum 1, newName }` — no `kind`
   - `lsp_code_actions`: `{ file, line: minimum 1, character: minimum 1 }` — no `kind`, no `newName`

3. **Per-tool guidance is specific:**
   - `lsp_hover.description` mentions "semantic type or symbol information"
   - `lsp_definition.description` mentions "semantic navigation"
   - `lsp_references.description` mentions "find all references"
   - `lsp_implementation.description` mentions "concrete implementations"
   - `lsp_rename.description` mentions "semantic rename planning"
   - `lsp_code_actions.description` mentions "semantic fixes or refactors"

4. **LSP_TOOL_NAMES contains all 10 names** (6 existing + 4 new)

Use `createPiMock()` from `supi-test-utils`. Mock `@mrclrchtr/supi-lsp` internals as needed.
