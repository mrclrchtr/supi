# Archive

Implemented an action-discriminated union for the `lsp` tool parameter schema in `packages/supi-lsp/src/lsp.ts`, replacing the previous flat object schema. This now rejects unsupported per-action fields at the schema layer while keeping action behavior unchanged.

Updated `packages/supi-lsp/__tests__/e2e-smoke.test.ts` to:
- stop assuming tool schemas always expose `.properties`
- align two stale prompt-guidance assertions with current `packages/supi-lsp/src/guidance.ts`
- add schema-level coverage proving:
  - `symbol_hover` accepts `{ action: "symbol_hover", symbol: ... }`
  - `symbol_hover` rejects an extra unsupported `path`
  - `hover` accepts its required file/position shape
  - `hover` rejects an extra unsupported `query`

Fresh verification run:
- `pnpm exec vitest run packages/supi-lsp/__tests__/e2e-smoke.test.ts` ✅
- `pnpm exec vitest run packages/supi-lsp/__tests__/e2e-smoke.test.ts packages/supi-lsp/__tests__/tool-actions.validation.test.ts && pnpm exec tsc --noEmit -p packages/supi-lsp/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-lsp/__tests__/tsconfig.json` ✅

Documentation closeout:
- No additional docs changes were needed for this feature because the `lsp` tool description already documented action-specific parameters correctly; this change brings runtime schema validation into alignment with that existing contract.
