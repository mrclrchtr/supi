# Task 8: Delete providers, export from API, clean up test mocks

## Clean up

- Delete `packages/supi-code-intelligence/src/providers/semantic-provider.ts`
- Delete `packages/supi-code-intelligence/src/providers/structural-provider.ts`
- Delete `packages/supi-code-intelligence/src/providers/` directory (now empty)

## Export new API surface

Update `packages/supi-code-intelligence/src/api.ts`:
```ts
// Add:
export type { SemanticSubstrate, StructuralSubstrate } from "./substrates/types.ts";
export type { CalleesData, CodeSymbol, ExportData, ImportData, NodeAtData, OutlineData, StructuralResult } from "./substrates/types.ts";
export { createSemanticSubstrate } from "./substrates/lsp-adapter.ts";
export { createStructuralSubstrate } from "./substrates/tree-sitter-adapter.ts";
```

Update `packages/supi-code-intelligence/src/index.ts` to re-export the same.

## Fix remaining test mocks

Scan `packages/supi-code-intelligence/__tests__/` for any remaining references to:
- `"../providers/semantic-provider.ts"` or `"../providers/structural-provider.ts"`
- `getSemanticService` or `withStructuralSession` in mock factories

These should all have been updated in tasks 5–7, but do a final audit.

## Fix unused imports

Run `pnpm exec biome check --write packages/supi-code-intelligence/src/` to remove unused imports (old provider imports, old `SessionLspService`/`TreeSitterService` type imports from actions).

## Verify

```bash
pnpm vitest run packages/supi-code-intelligence/
pnpm exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-code-intelligence/__tests__/tsconfig.json
```

All tests pass, no type errors.
