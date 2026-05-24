# Task 9: Full workspace verification

Full workspace verification:
1. `pnpm biome:fix` — lint + format all files
2. `pnpm typecheck` — typecheck all source
3. `pnpm typecheck:tests` — typecheck all tests
4. `pnpm test` — run all unit tests
5. Manual smoke: confirm no CI failures from downstream packages

Key risk areas to double-check:
- `supi-debug` status log has exactly 18 entries (was 15, added 3)
- `supi-lsp` unit tests all pass with updated tool names
- `supi-tree-sitter` unit tests all pass
- `supi-code-intelligence` tests pass (callees-action guidance strings updated)
- Integration tests pass
