# Deduplicate shared types between supi-code-intelligence and supi-code-runtime

Post-implementation cleanup: delete 11 duplicate canonical type definitions from `packages/supi-code-intelligence/src/types.ts` and re-import them from `@mrclrchtr/supi-code-runtime/api`. Remove the hollow `substrates/types.ts` alias layer, replace `ProviderAvailability` with `CapabilityState`, and remove unused devDeps from substrate packages.

## Problem

`packages/supi-code-intelligence/src/types.ts` redefines types already authored as the single source of truth in `packages/supi-code-runtime/src/types.ts`:

- `CodePosition`, `SourceRange`, `CodeLocation`, `CodeSymbol`
- `CodeResult<T>`, `ConfidenceMode`
- `OutlineData`, `ExportData`, `ImportData`, `NodeAtData`, `CalleesData`

Additionally:
- `ProviderAvailability` in code-intelligence/types.ts is structurally identical to `CapabilityState` in code-runtime
- `substrates/types.ts` is a hollow alias layer (`SemanticSubstrate = SemanticProvider`, etc.) with no actual adapter files backing it
- `supi-lsp/package.json` and `supi-tree-sitter/package.json` list `@mrclrchtr/supi-code-intelligence` as devDependencies that no source file imports

## Approach

1. **Delete duplicates from code-intelligence types.ts** — re-export from `@mrclrchtr/supi-code-runtime/api` instead
2. **Replace ProviderAvailability with CapabilityState** — update all consumers
3. **Delete substrates/types.ts** — inline the two remaining type aliases directly where used
4. **Remove unused devDeps** — clean `supi-lsp/package.json` and `supi-tree-sitter/package.json`

## Non-goals

- No tool ownership changes (lsp_* / tree_sitter_* stay in code-intelligence)
- No ArchitectureModel rename
- No new test coverage for code_refactor
- No runtime singleton strategy changes

## Files affected

### Modified
- `packages/supi-code-intelligence/src/types.ts` — delete 11 redefined types, import from code-runtime; replace `ProviderAvailability` with `CapabilityState`
- `packages/supi-code-intelligence/src/api.ts` — update exports
- `packages/supi-code-intelligence/src/index.ts` — update exports
- `packages/supi-code-intelligence/src/brief.ts` — update imports
- `packages/supi-code-intelligence/src/brief-focused.ts` — update imports (if using deleted types)
- `packages/supi-code-intelligence/src/substrates/types.ts` — will be deleted
- `packages/supi-code-intelligence/src/targeting/types.ts` — inline SemanticSubstrate/StructuralSubstrate aliases
- `packages/supi-code-intelligence/src/targeting/resolve-file.ts` — update imports
- `packages/supi-code-intelligence/src/targeting/resolve-symbol.ts` — update imports
- `packages/supi-code-intelligence/src/prioritization-signals.ts` — update imports if needed
- `packages/supi-code-intelligence/__tests__/unit/target-resolution.test.ts` — update mock types
- `packages/supi-lsp/package.json` — remove supi-code-intelligence devDep
- `packages/supi-tree-sitter/package.json` — remove supi-code-intelligence devDep

### Deleted
- `packages/supi-code-intelligence/src/substrates/types.ts`

## Verification

- All vitest tests pass (currently 231)
- TypeScript compiles cleanly (both src and __tests__ tsconfigs)
- Biome passes
- pnpm verify passes
