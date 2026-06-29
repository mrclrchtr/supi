# Task 5: Verify — tests, typecheck, biome, stale import scan

- `pnpm vitest run packages/supi-code-intelligence/` — all 292 tests must pass
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json` — clean typecheck
- `pnpm exec biome check packages/supi-code-intelligence` — existing-style-only, no new issues
- Verify no stale cross-package imports (`rg` scan for deleted files)
