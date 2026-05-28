# Task 2: Fix stale V2 workflow comments in surface.ts and names.ts

## Goal

Update two files in `packages/supi-code-intelligence/src/workflow/`:

### `surface.ts`
- In `code_health.nonGoals`, change "Does not remove public lsp_* or tree_sitter_* tools in Phase 0." to "Removed public lsp_* and tree_sitter_* tools in Phase 1.5 (TNDM-A9AQF4)."

### `names.ts`
- Change "Phase 0 note: this is design metadata only." to "Phase 1.5 note: code_resolve and code_health are active. Remaining names are design metadata for future phases."

## Verification

- `pnpm exec biome check packages/supi-code-intelligence/src/workflow/surface.ts packages/supi-code-intelligence/src/workflow/names.ts` — passes
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json` — no errors

