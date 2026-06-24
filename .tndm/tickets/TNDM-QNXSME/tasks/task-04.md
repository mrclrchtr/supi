# Task 4: refactor-apply file-mutation queue (C)

In `src/analysis/refactor/apply-workspace-edit.ts`, wrap the whole precompute-then-commit in `withFileMutationQueue` (import from `@earendil-works/pi-coding-agent`), acquiring the queue for every involved file in **sorted path order** before reading original contents, building transformed contents, and committing. Keep the existing cross-file rollback. No `executionMode` change. Per ADR 0006. Run `pnpm verify:ai`; audit refactor-plan-apply tests.
