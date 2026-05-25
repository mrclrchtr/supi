# Task 2: Profile imports — enable importDurations, run suite, capture slowest imports

## Goal
Identify the slowest-importing modules so we know what to add to `deps.optimizer`.

## Steps
1. Add `experimental.importDurations: { print: true }` to `vitest.config.ts`.
2. Run `pnpm test` and capture the import durations output (printed after tests complete).
3. Record the top 5-10 slowest imports with their durations.
4. Revert `importDurations.print` to `false` (or remove the key) — it adds overhead.

## Verification
- A list of slowest imports is captured (e.g. `@mrclrchtr/supi-core: 1.2s`, `typebox: 0.8s`).
- `importDurations` is disabled after profiling.

## Test-exempt
This is a profiling-only task — no testable code change.
