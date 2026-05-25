# Archive

## Redesign of code intelligence architecture — verification summary

### Task 1: Created `packages/supi-code-runtime/`
- New library-only package with shared types, capability interfaces, and workspace runtime
- 15 tests passing, zero pi extension surface
- TypeScript: clean, Biome: clean

### Task 2: Migrated `packages/supi-lsp/`
- Publishes semantic capabilities into shared workspace runtime
- Removed reverse dependency on `@mrclrchtr/supi-code-intelligence/api`
- 41 LSP unit tests passing
- `rg` confirms zero imports of `@mrclrchtr/supi-code-intelligence/api` in `packages/supi-lsp/`

### Task 3: Migrated `packages/supi-tree-sitter/`
- Publishes structural capabilities into shared workspace runtime
- Removed reverse dependency on `@mrclrchtr/supi-code-intelligence/api`
- 18 tree-sitter unit tests passing
- `rg` confirms zero imports of `@mrclrchtr/supi-code-intelligence/api` in `packages/supi-tree-sitter/`

### Task 4: Refactored `packages/supi-code-intelligence/`
- Now consumes shared workspace runtime via `request-context.ts` instead of owning local provider registry
- Removed `provider/code-provider.ts`, `provider/registry.ts`, `provider/wiring.ts`, `provider/types.ts`
- Updated all 5 tool executors, 4 use-cases, target resolution, and extension entry point
- 191 code-intelligence tests passing
- API surface updated to re-export contracts from `@mrclrchtr/supi-code-runtime`

### Task 5: Updated repo metadata
- Added `supi-code-runtime` to `docs/package-layout.md` package matrix
- Added `packages/supi-code-runtime/package.json` to `release-please-config.json`
- Full stack verification: 92 test files, 877 tests passing, TypeScript clean across all 4 packages
- Individual packaging verified for all 4 packages

### Key metrics
- **892 total tests** across 4 packages (92 test files) — all pass
- **Zero reverse imports** from `supi-lsp` or `supi-tree-sitter` into `@mrclrchtr/supi-code-intelligence/api`
- **Zero errors** in Biome checks across all 4 packages
- **TypeScript clean** across all 4 package/tsconfig builds
