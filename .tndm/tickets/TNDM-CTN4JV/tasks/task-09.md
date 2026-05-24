# Task 9: Full verification: biome, typecheck, full test suite

Final verification sweep across both affected packages. No code changes expected — this validates everything from tasks 1–8.

```bash
# Biome lint + format
pnpm exec biome check packages/supi-code-intelligence/
pnpm exec biome check packages/supi-core/

# Typecheck all source + test configs
pnpm exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-code-intelligence/__tests__/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-core/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-core/__tests__/tsconfig.json

# Full test suite for affected packages
pnpm vitest run packages/supi-code-intelligence/
pnpm vitest run packages/supi-core/
```

Also run a broader downstream check to ensure no package that depends on supi-core's API surface breaks:

```bash
pnpm vitest run packages/supi-lsp/ packages/supi-tree-sitter/
```

All must pass.
