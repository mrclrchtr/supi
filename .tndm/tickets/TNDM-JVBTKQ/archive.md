# Archive

Implemented the breaking `lsp` tool API change from flat action fields to a top-level `{ action, args }` object while preserving provider-compatible top-level schema shape.

Final code/docs state verified against the approved intent:
- `packages/supi-lsp/src/lsp.ts` now registers a top-level object schema with nested `args` and no stale `LspAction` import.
- `packages/supi-lsp/src/tool-actions.ts` consumes nested `args` while preserving friendly runtime validation messages for partial inputs.
- `packages/supi-lsp/src/guidance.ts` documents the `{ action, args }` shape, restores the systemic-root-cause / stale-diagnostics / `pnpm install` heuristics, and now recommends `workspace_symbol` followed by `hover` for generic type lookups instead of ambiguous `symbol_hover`.
- `packages/supi-tree-sitter/src/tree-sitter.ts` prompt guidance now names the `tree_sitter` tool explicitly.
- `packages/supi/package.json` still advertises `pi.image`, and `packages/supi/docs/screenshots/hero.png` now exists and is shipped by `npm pack`.
- Existing maintainer docs already touched by the change (`packages/supi-lsp/CLAUDE.md`) remain aligned with the final behavior; no additional documentation edits were needed during archive.

Fresh verification evidence:
1. `pnpm exec biome check packages/supi-lsp/src/lsp.ts packages/supi-tree-sitter/src/tree-sitter.ts`
   - Result: `Checked 2 files in 2s. No fixes applied.`
2. `(cd packages/supi && npm pack --dry-run --json | jq -r '.[0].files[].path' | rg '^docs/screenshots/hero\\.png$')`
   - Result: `docs/screenshots/hero.png`
3. `pnpm exec vitest run packages/supi-lsp/__tests__/e2e-smoke.test.ts packages/supi-lsp/__tests__/tool-actions.validation.test.ts packages/supi-lsp/__tests__/tool-actions.test.ts packages/supi-lsp/__tests__/tool-actions.recover.test.ts packages/supi-lsp/__tests__/tool-actions.integration.test.ts packages/supi-lsp/__tests__/tool-actions-workspace.integration.test.ts`
   - Result: `Test Files  6 passed (6)` / `Tests  93 passed (93)`
4. `pnpm exec tsc --noEmit -p packages/supi-lsp/tsconfig.json`
   - Result: exited successfully with no output
5. `pnpm exec tsc --noEmit -p packages/supi-lsp/__tests__/tsconfig.json`
   - Result: exited successfully with no output

All planned tasks (1-5) are complete, and the implemented result matches the approved design plus documented review follow-ups.
