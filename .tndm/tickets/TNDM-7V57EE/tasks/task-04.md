# Task 4: Phase 4: Migrate use-cases to unified CodeProvider via DI, delete substrate adapters

## Goal

Replace all dynamic `import("../substrates/*-adapter.ts")` calls in use-case functions with explicit dependency injection using `getCodeProvider(cwd)`. Delete the adapter files. Code-intelligence no longer directly imports from `@mrclrchtr/supi-lsp` or `@mrclrchtr/supi-tree-sitter`.

## Files to modify

### use-case layer — replace dynamic imports with DI

Each of these files currently does:
```ts
const semantic = await import("../substrates/lsp-adapter.ts").then(m => m.createSemanticSubstrate(deps.cwd));
const structural = await import("../substrates/tree-sitter-adapter.ts").then(m => m.createStructuralSubstrate(deps.cwd));
```

Replace with:
```ts
const provider = getCodeProvider(deps.cwd);
if (provider.kind !== "ready") { /* return unavailable result */ }
```

Files to change:
- `packages/supi-code-intelligence/src/use-case/generate-brief.ts` — replace dynamic imports, use `provider.references()`, `provider.documentSymbols()`, `provider.nodeAt()`, `provider.outline()`, `provider.imports()`, `provider.exports()`
- `packages/supi-code-intelligence/src/use-case/generate-relations.ts` — replace for callers (uses `semantic.references`), implementations (uses `semantic.implementation`), callees (uses `structural.calleesAt`)
- `packages/supi-code-intelligence/src/use-case/generate-affected.ts` — replace dynamic imports
- `packages/supi-code-intelligence/src/use-case/generate-pattern.ts` — replace for structured pattern search (uses `structural.*`)
- `packages/supi-code-intelligence/src/targeting/resolve-file.ts` — replace `createStructuralSubstrate` fallback with `getCodeProvider`

### BriefDeps / RelationsDeps types

Update these to include `provider` in the deps object instead of relying on dynamic imports:

```ts
// In use-case/types.ts
import type { CodeProvider } from "../provider/code-provider.ts";

export interface BriefDeps {
  cwd: string;
  model: ArchitectureModel | null;
  provider: CodeProvider | null;  // ADDED — injected, not dynamically imported
}
```

Same for `RelationsDeps`, `AffectedDeps`, `PatternDeps`.

### Tool execute-* files — inject provider

- `packages/supi-code-intelligence/src/tool/execute-brief.ts` — resolve `getCodeProvider(ctx.cwd)`, pass into `executeBrief()`
- `packages/supi-code-intelligence/src/tool/execute-relations.ts` — same
- `packages/supi-code-intelligence/src/tool/execute-affected.ts` — same
- `packages/supi-code-intelligence/src/tool/execute-pattern.ts` — same

### Delete adapter files

- `packages/supi-code-intelligence/src/substrates/lsp-adapter.ts` — DELETE
- `packages/supi-code-intelligence/src/substrates/tree-sitter-adapter.ts` — DELETE
- `packages/supi-code-intelligence/src/substrates/types.ts` — simplify to only re-export canonical types (no more substrate aliases)
- `packages/supi-code-intelligence/src/substrates/` directory — remove if empty after deletions

### Remove package dependencies

- `packages/supi-code-intelligence/package.json` — remove `@mrclrchtr/supi-lsp` and `@mrclrchtr/supi-tree-sitter` from dependencies and bundledDependencies (breaks the circular dep)
- `packages/supi-code-intelligence/package.json` — remove `node_modules/@mrclrchtr/supi-lsp/src/extension.ts` and `node_modules/@mrclrchtr/supi-tree-sitter/src/extension.ts` from `pi.extensions`

## Important: circular dependency resolution

After Phase 3, the dependency graph becomes:
- `supi-lsp` → depends on `supi-code-intelligence` (for CodeProvider type)
- `supi-tree-sitter` → depends on `supi-code-intelligence`
- `supi-code-intelligence` → depends on NEITHER

This eliminates the circular dependency. Code-intelligence only depends on `supi-code-runtime` (for now, until Phase 6).

## Update test files

- Any test that mocks `../substrates/lsp-adapter.ts` or `../substrates/tree-sitter-adapter.ts` must be updated to mock `getCodeProvider` from the registry instead.
- Audit with: `rg "substrates/(lsp|tree-sitter)-adapter" packages/supi-code-intelligence/__tests__/`

## Verification

```bash
# Typecheck all
pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json
pnpm exec tsc -b packages/supi-lsp/tsconfig.json
pnpm exec tsc -b packages/supi-tree-sitter/tsconfig.json

# Run all code-intelligence tests
pnpm vitest run packages/supi-code-intelligence/

# Run LSP + tree-sitter tests to ensure registries still work
pnpm vitest run packages/supi-lsp/
pnpm vitest run packages/supi-tree-sitter/

# Verify no circular imports
rg "from.*supi-lsp" packages/supi-code-intelligence/src/
rg "from.*supi-tree-sitter" packages/supi-code-intelligence/src/

# Biome
pnpm exec biome check packages/supi-code-intelligence/

# Pack verification (code-intelligence must pack without LSP/TS bundled)
node scripts/publish.mjs packages/supi-code-intelligence
```

