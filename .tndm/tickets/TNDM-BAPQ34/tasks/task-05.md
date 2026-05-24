# Task 5: Full verification: typecheck, lint, and downstream test sweep

Run full verification:

1. `pnpm exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json` — source typecheck
2. `pnpm exec tsc --noEmit -p packages/supi-code-intelligence/__tests__/tsconfig.json` — test typecheck
3. `pnpm exec biome check packages/supi-code-intelligence/` — lint + format
4. `pnpm vitest run packages/supi-code-intelligence/` — all code-intelligence tests
5. `pnpm vitest run packages/supi-core/ packages/supi-lsp/ packages/supi-tree-sitter/` — downstream regression sweep (these packages don't import from code-intelligence actions, but verify no accidental breakage)

Update `packages/supi-code-intelligence/CLAUDE.md`:
- Add `semantic-references.ts` to the architecture diagram under `actions/`
- Add a brief note about the three shared helpers

If biome flags unused imports left by the deletion of private functions, fix them.
