# Archive

## Verification Results — TNDM-GKYTV2

### Final gate: `pnpm verify` (fresh, 2026-05-27)
- **TypeScript**: no errors across all packages
- **Biome**: no diagnostics
- **Tests**: 177 passed | 2 skipped (179 test files), 1627 passed | 4 skipped (1631 tests)
- **Pack verify**: All 18 packages verified

### Cross-package targeted tests
- `packages/supi-code-intelligence/__tests__/`: all passing (35/37, 2 skipped)
- `packages/supi-tree-sitter/__tests__/`: all passing
- `packages/supi-lsp/__tests__/`: all passing

### Review fixes applied after close
- Family barrel `code/execute.ts` now exports `executeCodeRelationsTool` from family-specific wrapper
- Double-slash in import path corrected (`../..//` → `../../`)

### Boundary checks after reopen
- No `TODO:` or `placeholder` strings remain in any source file
- Stale "interim port" / "replicated metadata" comments removed from tool-specs, format-utils, settings
- `code-intelligence.ts` now imports from `tool/families/*` paths
- All three tool families (`code`, `lsp`, `tree-sitter`) have complete specs/guidance/register/execute/format files
- All six analysis services delegate to real implementations (no placeholders)
- Relations service dispatches to callers/implementations/callees sub-modules with real provider logic
- Only `packages/supi-code-intelligence/package.json` advertises `pi.extensions`
- `packages/supi-tree-sitter/src/api.ts` no longer exports handler/formatting APIs
