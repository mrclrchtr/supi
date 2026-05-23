# Task 3: Full verification: typecheck, biome, tests, downstream smoke test

Run full verification suite for the supi-core package:

1. `pnpm exec biome check --write packages/supi-core/` — auto-fix any lint/format issues
2. `pnpm exec tsc --noEmit -p packages/supi-core/tsconfig.json` — typecheck source
3. `pnpm exec tsc --noEmit -p packages/supi-core/__tests__/tsconfig.json` — typecheck tests
4. `pnpm vitest run packages/supi-core/` — run all supi-core tests (must all pass)

Also audit downstream `vi.mock("@mrclrchtr/supi-core")` factories that may need updating since new exports were added to the public API. Run `pnpm vitest run packages/supi-lsp/ packages/supi-code-intelligence/ packages/supi-tree-sitter/` as a quick smoke test to catch any mock breakage caused by the new exports.

If downstream mock breakage is found, fix it by adding the new exports to the mock factories.
