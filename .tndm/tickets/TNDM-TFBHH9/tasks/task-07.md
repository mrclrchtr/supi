# Task 7: Final verification — benchmark, stability, lint, and typecheck

## Goal
Confirm the full suite is faster, stable, and clean.

## Steps
1. **Timing**: Run `time pnpm test` and compare to baseline from task 1. Document the improvement percentage.
2. **Stability**: Run `pnpm test` 3 consecutive times. All three must produce identical pass/fail results.
3. **Biome**: `pnpm exec biome check` — must pass.
4. **Typecheck**: `pnpm typecheck` — must pass.
5. **Spot-check watch mode**: Run `pnpm vitest --project supi-core` and edit a test file. Confirm related tests rerun without errors.

## Verification
- Timing shows measurable improvement (target: 30%+).
- 3 consecutive runs have no flakes.
- Biome and typecheck pass.
- Watch mode works.

## Test-exempt
Verification-only task — no code changes.
