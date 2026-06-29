# Archive

## Verification

### Task 1: Definition in code_brief anchored output
- Added `definition?` to `SemanticProvider` in supi-code-runtime
- Wired `definition` in `createLspSemanticProvider` (LSP adapter, reuses existing `SessionLspService.definition()`)
- Forwarded `definition` through composite provider in request-context.ts (**fixed post-review**: was initially missing)
- Added `definition` field to `TreeSitterContext`, gathered in `gatherTreeSitterContext`
- Rendered `## Definition` section in `appendTreeSitterContext` (after hover, before outline)
- Tests: 5 new definition tests (renders with data, decodes file:// URIs, null, empty, 0-based→1-based conversion)

### Task 2: Per-position code actions in code_brief anchored output
- Added `codeActionTitles?` to `SemanticProvider` (lightweight display method, separate from `codeActions` for refactoring)
- Implemented `codeActionTitles` in LSP adapter (extracts titles from LSP CodeAction[])
- Forwarded `codeActionTitles` + `rename` through composite provider
- Added `codeActions` field to `TreeSitterContext`, gathered in `gatherTreeSitterContext`
- Rendered `## Code Actions` section (after definition, before outline)
- Tests: 4 new code actions tests (renders with data including kind label, null, empty, kind-undefined grace)

### Code review fix
- Found: `definition` was missing from `createCompositeProvider` — TypeScript didn't catch it because `definition?` is optional on `SemanticProvider`
- Fixed: added single-line forwarding `semantic?.definition?.(filePath, position) ?? null` immediately after `hover`

### Fresh test results (post-fix)
- Full suite: 742 tests passing, 4 skipped
- TypeScript type check: clean across all 3 packages (`supi-code-runtime`, `supi-lsp`, `supi-code-intelligence`)
- No diagnostics, no breaking changes

### Files changed
- `packages/supi-code-runtime/src/capability/types.ts` — added `definition?` + `codeActionTitles?`
- `packages/supi-lsp/src/provider/lsp-semantic-provider.ts` — implemented both methods
- `packages/supi-code-intelligence/src/analysis/context/request-context.ts` — forwarded both + `codeActions` + `rename` through composite
- `packages/supi-code-intelligence/src/use-case/generate-brief.ts` — added to TreeSitterContext, best-effort gathering
- `packages/supi-code-intelligence/src/presentation/markdown/brief.ts` — rendered `## Definition` + `## Code Actions`
- `packages/supi-code-intelligence/__tests__/unit/presentation/anchored-brief.test.ts` — +8 tests
- `packages/supi-code-intelligence/CLAUDE.md` — documented anchored brief sections
