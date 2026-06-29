# Archive

## Verification Evidence

### Fresh test run (2026-05-26T02:48):
- **code-intelligence tests**: 231 passed, 4 skipped (24 test files) — same as baseline
- **TypeScript**:
  - `supi-code-intelligence/src` — clean
  - `supi-code-intelligence/__tests__` — clean
  - `supi-lsp/src` — clean
  - `supi-tree-sitter/src` — clean
- **Biome**: 257 files checked, no fixes applied (3 packages)
- **pnpm verify**: All 18 packages verified (1570 tests passed, pack checks for all packages)

### What changed:
- Deleted 12 duplicate canonical type definitions from `supi-code-intelligence/src/types.ts` (CodePosition, SourceRange, CodeLocation, CodeSymbol, CodeResult, ConfidenceMode, ProviderAvailability, OutlineData, ExportData, ImportData, NodeAtData, CalleesData); replaced with re-exports from `@mrclrchtr/supi-code-runtime/api`
- Replaced ProviderAvailability with CapabilityState as the canonical availability type
- Deleted `packages/supi-code-intelligence/src/substrates/types.ts` (hollow alias layer) and empty `substrates/` directory
- Inlined `SemanticProvider as SemanticSubstrate` / `StructuralProvider as StructuralSubstrate` aliases directly from `@mrclrchtr/supi-code-runtime/api` in 8 consumer files + 3 test files
- Removed unused `@mrclrchtr/supi-code-intelligence` devDependency from both `supi-lsp/package.json` and `supi-tree-sitter/package.json`
- Updated `CLAUDE.md` architecture tree to reflect deleted `substrates/` directory

### Files modified: 22
### Files deleted: 2 (substrates/types.ts, substrates/ directory)
