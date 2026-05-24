# Archive

## Verification Results

### Fixes applied after code review
- **#1** — callees-action.ts: Added `SemanticSubstrate` param, threaded through executor
- **#2** — lsp-adapter.ts: Added `location.range.start` fallback for flat `SymbolInformation[]`
- **#3** — target-resolution.ts: Filter out range-less workspace symbols (line=0,char=0)
- **#4** — semantic-file-target.test.ts: Mock `@mrclrchtr/supi-tree-sitter/api` instead of deleted provider

### Full verification
- Biome: clean (source files)
- TypeScript: 4 configs clean (CI source, CI tests, core source, core tests)
- Tests: 961 pass across 4 packages (code-intelligence, core, lsp, tree-sitter)
- E2E: All 5 code-intelligence tools tested via pi — `code_brief`, `code_relations` (callers), `code_affected` (symbol + anchored), `code_pattern` (structured + literal) — all working through adapters
