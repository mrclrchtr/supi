# Task 6: Add and update tests for hover absorption

## Goal

Add and update tests for the hover absorption. Ensure full test coverage.

## Changes

1. **`packages/supi-code-intelligence/__tests__/unit/generate-brief.test.ts`** (or create):
   - Test that when provider has hover, `gatherTreeSitterContext` includes hover data
   - Test that when provider.hover returns null, context.hover is null
   - Test that when provider has no hover method, context.hover is null (best-effort)
   - Test coordinate conversion: 1-based input → 0-based hover call

2. **`packages/supi-code-intelligence/__tests__/unit/brief-markdown.test.ts`** (or create):
   - Test anchored brief rendering with hover data includes "Hover" section
   - Test anchored brief rendering without hover omits the section

3. **`packages/supi-lsp/__tests__/unit/lsp-semantic-provider.test.ts`** (or update existing):
   - Test hover conversion from LSP Hover to simplified shape

4. Verify no regressions in existing tests.

## Verification
- `pnpm vitest run packages/supi-code-intelligence/` — all pass
- `pnpm vitest run packages/supi-lsp/` — all pass
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json` passes
- `pnpm exec tsc -b packages/supi-code-intelligence/__tests__/tsconfig.json` passes

