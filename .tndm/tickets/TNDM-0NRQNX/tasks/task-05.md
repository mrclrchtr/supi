# Task 5: Full verification: all tests, types, lint, pnpm verify

## Goal

Run all verification end-to-end to confirm the entire change is correct and nothing regressed.

## Commands

```bash
# All code-intelligence tests
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/

# TypeScript for all three affected packages
pnpm exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-code-intelligence/__tests__/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-lsp/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-tree-sitter/tsconfig.json

# Lint
pnpm exec biome check packages/supi-code-intelligence packages/supi-lsp packages/supi-tree-sitter

# Full verify
pnpm verify
```

## Expected

- All 231 code-intelligence tests pass (same as baseline)
- All TypeScript compilations clean
- Biome reports no errors
- `pnpm verify` passes (may have pre-existing warnings not caused by this change)

## Verification

- Visual inspection of command outputs — all should be green exit codes
