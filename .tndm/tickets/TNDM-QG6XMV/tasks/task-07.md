# Task 7: Run full verify (typecheck + tests + lint)

Run:
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`
- `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/`
- `pnpm exec biome check packages/supi-code-intelligence/ --max-diagnostics=30`

All must pass cleanly.
