# Task 5: [TDD GREEN] Update LSP tool names, specs, and guidance for 6 focused tools

**`tool/names.ts`:**
- Replace `LSP_LOOKUP_TOOL = "lsp_lookup"` with 4 new constants:
  - `LSP_HOVER_TOOL = "lsp_hover"`
  - `LSP_DEFINITION_TOOL = "lsp_definition"`
  - `LSP_REFERENCES_TOOL = "lsp_references"`
  - `LSP_IMPLEMENTATION_TOOL = "lsp_implementation"`
- Replace `LSP_REFACTOR_TOOL = "lsp_refactor"` with 2 new constants:
  - `LSP_RENAME_TOOL = "lsp_rename"`
  - `LSP_CODE_ACTIONS_TOOL = "lsp_code_actions"`
- Update `LSP_TOOL_NAMES` from 6 to 10 entries (remove `lsp_lookup` and `lsp_refactor`, add 6 new names)

**`tool/tool-specs.ts`:**
- Replace the `lsp_lookup` spec entry with 4 focused spec entries (`lsp_hover`, `lsp_definition`, `lsp_references`, `lsp_implementation`)
- Replace the `lsp_refactor` spec entry with 2 focused spec entries (`lsp_rename`, `lsp_code_actions`)
- Each new spec uses the simpler parameter schema (no `kind` field)
- `lsp_rename` includes `newName` as a required field (not runtime validation)
- All 4 lookup tools get `includeCoverageGuidelines: true`
- Export `executeLookupHover`, `executeLookupDefinition`, etc. as thin wrappers around the current switch-case dispatch (logical split, not code duplication)
- Remove `LSP_LOOKUP_KIND_NAMES`, `LSP_REFACTOR_KIND_NAMES`, and their `StringEnum` types since `kind` is gone

**`tool/guidance.ts`:**
- Update `buildLspToolPromptSurfaces` to generate surfaces for the 10 tool names
- Remove compatibility exports for old tool names (`toolDescription`, `promptSnippet`, `promptGuidelines`, `buildProjectGuidelines`)
- Each lookup tool includes server-coverage guidelines (not just the old `lsp_lookup`)
