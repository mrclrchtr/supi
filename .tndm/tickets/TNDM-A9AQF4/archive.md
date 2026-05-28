# Archive

## Verification — TNDM-A9AQF4 Phase 1.5

All 7 tasks verified fresh on 2026-05-28:

### Automated checks
- **TypeScript**: `tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json` — zero errors
- **Biome**: `biome check packages/supi-code-intelligence/src/ packages/supi-code-intelligence/__tests__/` — 149 files, no errors
- **Vitest**: `vitest run packages/supi-code-intelligence/` — 38/38 files pass, 341/341 tests pass, 2 skipped (integration), 4 skipped (conditional)

### Review fixes verified
- Zero `lsp_*` references in model-facing code paths (confirmed via grep across all src/*.ts files, excluding library/substrate modules)
- No dynamic LSP tool registration in `lsp/session-lifecycle.ts` (confirmed: `registerLspTools` call removed)
- `code_health` description no longer names `lsp_diagnostics` or `lsp_recover`
- Dead `maxResults` parameter removed from `CodeHealthToolParams`
- All 6 model-facing `lsp_hover`/`lsp_diagnostics` references replaced with `code_brief`/`code_health`

### Guidance quality
- `INTENT_GUIDELINES` overlay removed; `basePromptGuidelines` is single source of truth
- Every guideline bullet self-identifies its tool (confirmed via automated check: no ambiguous bullets)
- Zero `lsp_*` or `tree_sitter_*` references in `src/tool/guidance.ts`
- `docs/pi/tool-guidance.md` updated with flat-list BAD/GOOD examples

### Changes summary
- 32 files: 1206 insertions, 168 deletions
- 3 new files: `code-health-tool.test.ts`, `execute-health.ts`, `health.ts`
- 16 substrate tools removed from public surface (10 lsp_*, 6 tree_sitter_*)
- LSP/tree-sitter lifecycle controllers and service layers preserved as internal substrates
