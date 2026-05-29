# Archive

## Verification

### Task 1: Definition in code_brief anchored output
- Added `definition?` to `SemanticProvider` in supi-code-runtime
- Wired `definition` in `createLspSemanticProvider` (LSP adapter, reuses existing `SessionLspService.definition()`)
- Forwarded `definition` through composite provider in request-context.ts
- Added `definition` field to `TreeSitterContext`, gathered in `gatherTreeSitterContext`
- Rendered `## Definition` section in `appendTreeSitterContext` (after hover, before outline)
- Tests: 5 new definition tests (renders with data, decodes file:// URIs, null, empty, 0-based→1-based conversion)

### Task 2: Per-position code actions in code_brief anchored output
- Added `codeActionTitles?` to `SemanticProvider` (lightweight display method, separate from `codeActions` for refactoring)
- Implemented `codeActionTitles` in LSP adapter (extracts titles from LSP CodeAction[])
- Forwarded `codeActionTitles` through composite provider
- Added `codeActions` field to `TreeSitterContext`, gathered in `gatherTreeSitterContext`
- Rendered `## Code Actions` section (after definition, before outline)
- Tests: 4 new code actions tests (renders with data including kind label, null, empty, kind-undefined grace)

### Test results
- Full suite: 742 tests passing, 4 skipped (was 734 — +8 new tests)
- TypeScript type check: clean across all 3 packages
- No lint diagnostics
- No schema changes, no breaking changes
