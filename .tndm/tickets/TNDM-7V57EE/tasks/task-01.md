# Task 1: Phase 1: Move canonical types and provider contracts from supi-code-runtime into supi-code-intelligence

## Goal

Move the shared types and provider contracts from `supi-code-runtime/src/` into `supi-code-intelligence/src/`. Keep `supi-code-runtime` as a re-export shell so all existing imports continue working.

## Files to create

- `packages/supi-code-intelligence/src/types.ts` — copy canonical types from `packages/supi-code-runtime/src/types.ts` (CodePosition, CodeResult<T>, CodeSymbol, CodeLocation, OutlineData, ExportData, ImportData, NodeAtData, CalleesData, ConfidenceMode, ProviderAvailability)
- `packages/supi-code-intelligence/src/provider/types.ts` — copy provider contracts from `packages/supi-code-runtime/src/provider/types.ts` (SemanticProvider, StructuralProvider, StructuralResult)

## Files to modify

- `packages/supi-code-intelligence/src/api.ts` — add re-exports of the moved types and provider contracts
- `packages/supi-code-intelligence/src/index.ts` — mirror api.ts changes
- `packages/supi-code-runtime/src/api.ts` — replace direct exports with re-exports from `@mrclrchtr/supi-code-intelligence/api`
- `packages/supi-code-runtime/src/index.ts` — mirror api.ts changes
- `packages/supi-code-runtime/package.json` — add `@mrclrchtr/supi-code-intelligence` to dependencies and bundledDependencies (runtime now depends on code-intelligence)
- `packages/supi-code-intelligence/package.json` — add `@mrclrchtr/supi-code-runtime` to dependencies? **No** — this would create a circular dependency. Instead, `supi-code-runtime` depends on `supi-code-intelligence`, and code-intelligence does NOT depend on runtime. The `substrates/types.ts` file that currently re-exports from runtime should be updated to re-export from `../types.ts` and `../provider/types.ts` directly.

## Files to update (imports)

- `packages/supi-lsp/src/provider/lsp-semantic-provider.ts` — change import from `@mrclrchtr/supi-code-runtime/api` to `@mrclrchtr/supi-code-intelligence/api`
- `packages/supi-tree-sitter/src/provider/tree-sitter-provider.ts` — same import change
- `packages/supi-code-intelligence/src/substrates/types.ts` — remove re-export from runtime, re-export from local `../types.ts` and `../provider/types.ts`

## Verification

```bash
# Typecheck all affected packages
pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json
pnpm exec tsc -b packages/supi-lsp/tsconfig.json
pnpm exec tsc -b packages/supi-tree-sitter/tsconfig.json
pnpm exec tsc -b packages/supi-code-runtime/tsconfig.json

# Run all tests
pnpm vitest run packages/supi-code-intelligence/
pnpm vitest run packages/supi-lsp/
pnpm vitest run packages/supi-tree-sitter/

# Biome
pnpm exec biome check packages/supi-code-intelligence/ packages/supi-lsp/ packages/supi-tree-sitter/ packages/supi-code-runtime/

# Pack verification
node scripts/publish.mjs packages/supi-code-intelligence
node scripts/publish.mjs packages/supi-lsp
node scripts/publish.mjs packages/supi-tree-sitter
```
