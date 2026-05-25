# Task 1: Baseline benchmark — capture current full-suite timing

## Goal
Capture the current `pnpm test` duration so we can measure improvement after all changes.

## Steps
1. Run `time pnpm test` and record the total wall-clock time.
2. Note any test failures or flakes that exist before changes.

## Verification
- A baseline timing number is recorded (e.g. "45s").
- Any pre-existing failures are documented so they aren't mistaken for regressions.

## Test-exempt
This is a measurement task — no code changes.
