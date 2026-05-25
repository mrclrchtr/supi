# Task 5: Tune deps.optimizer — add slow packages from profiling data

## Goal
Populate `deps.optimizer.ssr.include` with the slowest-importing packages identified in task 2, then verify no regressions.

## File
`vitest.config.ts` — the `include` array under `deps.optimizer.ssr`

## Steps
1. Review the profiling data from task 2.
2. Add each slow package to `include`. Likely candidates:
   - `@mrclrchtr/supi-core` (11 domain entry points, imported by most packages)
   - Any other package with >500ms import time.
3. Run `pnpm test` — verify all tests pass.
4. If any package in `include` causes failures (e.g., decorator issues, dynamic imports), remove it and document why.

## Verification
- `pnpm test` passes with the populated `include` array.
- No new test failures.
- If a package is excluded, the rationale is documented in the config file as a comment.

## Test-exempt
Config-only change — verified by running the suite.
