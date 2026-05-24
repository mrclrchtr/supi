# Task 4: Update supi-review docs and run package regression verification

## Goal
Leave `supi-review` documented and regression-checked after the compact-packet redesign.

## Changes
- Update `packages/supi-review/README.md` so it describes the new reviewer context model accurately:
  - compact packet up front
  - snapshot-aware tools for per-file diff and before/after inspection
  - no implication that the reviewer receives a large inline diff bundle
- Update `packages/supi-review/CLAUDE.md` architecture and gotcha notes to match the new tool-driven review flow.
- Reconcile any touched tests so the final package state is internally consistent.

## Verification
Run the full package regression sweep after the implementation tasks are complete:
- `pnpm vitest run packages/supi-review/`
- `pnpm exec tsc --noEmit -p packages/supi-review/tsconfig.json`
- `pnpm exec tsc --noEmit -p packages/supi-review/__tests__/tsconfig.json`
- `pnpm exec biome check packages/supi-review/`

## Done when
The package docs match reality and the full targeted verification suite is green.
