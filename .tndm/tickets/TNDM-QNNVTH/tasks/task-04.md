# Task 4: [TDD GREEN] Implement truthful code_health include, coverage, and unused sections

## Goal
Make `code_health` honor the public `include` contract and surface `coverage` / `unused` as real health sections.

## Files
- `packages/supi-code-intelligence/src/tool/execute-health.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/health.ts`
- `packages/supi-code-intelligence/src/prioritization-signals.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-health-tool.test.ts`
- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`

## Change
Implement the smallest coherent production change that makes Task 3 pass:
- keep default behavior when `include` is omitted
- when `include` is provided, collect and render only the requested sections
- surface `coverage` and `unused` from the existing prioritization-signal inputs rather than accepting them as ignored enum values
- return explicit requested-section output when a coverage or unused report is unavailable
- keep the result honest: do not silently fall back to diagnostics when the user asked for another section
- update the package docs/guidance so the `code_health` contract matches the implemented behavior

## Verification
Re-run the focused health test file, then run package typecheck to catch API/shape drift:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-code-intelligence/__tests__/unit/code-health-tool.test.ts

RTK_DISABLED=1 pnpm exec tsc -b \
  packages/supi-code-intelligence/tsconfig.json \
  packages/supi-code-intelligence/__tests__/tsconfig.json
```

Expected result: the health tests pass and TypeScript stays clean.

## Test mode
Test-driven (GREEN). Keep changes limited to what the RED tests require.
