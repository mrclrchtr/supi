# Task 9: Verify: full test suite + typecheck + lint across all modified packages

## Goal
Run the full test suite, typecheck, and lint across all modified packages plus supi-core to confirm the refactoring is correct end-to-end.

## Commands
```bash
# Typecheck all modified packages
pnpm exec tsc -b packages/supi-core/tsconfig.json
pnpm exec tsc -b packages/supi-insights/tsconfig.json packages/supi-insights/__tests__/tsconfig.json
pnpm exec tsc -b packages/supi-review/tsconfig.json packages/supi-review/__tests__/tsconfig.json
pnpm exec tsc -b packages/supi-bash-timeout/tsconfig.json packages/supi-bash-timeout/__tests__/tsconfig.json
pnpm exec tsc -b packages/supi-cache/tsconfig.json packages/supi-cache/__tests__/tsconfig.json
pnpm exec tsc -b packages/supi-claude-md/tsconfig.json packages/supi-claude-md/__tests__/tsconfig.json
pnpm exec tsc -b packages/supi-rtk/tsconfig.json packages/supi-rtk/__tests__/tsconfig.json

# Test all modified packages
pnpm vitest run packages/supi-core/
pnpm vitest run packages/supi-insights/
pnpm vitest run packages/supi-review/
pnpm vitest run packages/supi-bash-timeout/
pnpm vitest run packages/supi-cache/
pnpm vitest run packages/supi-claude-md/
pnpm vitest run packages/supi-rtk/

# Lint all modified packages
pnpm exec biome check packages/supi-core/src/llm.ts packages/supi-core/src/config/ packages/supi-core/src/tool-framework.ts packages/supi-core/src/api.ts
pnpm exec biome check packages/supi-insights/src/
pnpm exec biome check packages/supi-review/src/
pnpm exec biome check packages/supi-bash-timeout/src/
pnpm exec biome check packages/supi-cache/src/
pnpm exec biome check packages/supi-claude-md/src/
pnpm exec biome check packages/supi-rtk/src/
```

## Expected results
- All typechecks pass with zero errors
- All tests pass (no regressions)
- All lint checks pass (Biome)
- No warnings about unused imports, unused suppression comments, or dead code

## Failure handling
If any step fails, fix the issue before marking this task complete. This is the integration gate.
