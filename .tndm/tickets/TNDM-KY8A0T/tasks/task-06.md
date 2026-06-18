# Task 6: Run package and workspace verification

## Goal
Prove the assembled redesign works end-to-end and leaves the workspace healthy.

## Files
- No source files should be changed in this task unless verification exposes a defect.
- If a defect is found, fix the smallest affected source/test/doc file and rerun the full command set below.

## Verification commands
Run package tests with verbose raw output:
```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-ask-user/ -v
```
Expected result: all `supi-ask-user` tests pass.

Run package source and test typecheck:
```bash
pnpm exec tsc -b packages/supi-ask-user/tsconfig.json packages/supi-ask-user/__tests__/tsconfig.json
```
Expected result: no TypeScript errors.

Run package lint/format check:
```bash
pnpm exec biome check packages/supi-ask-user
```
Expected result: no diagnostics.

Search for removed contract terms:
```bash
rg -n "allowOther|allowPartialSubmit|answersById|missingQuestionIds|finishPartial|finishDiscuss|discussMessage|CustomAnswer|status: \"partial\"|status: \"discuss\"" packages/supi-ask-user
```
Expected result: no matches.

Run the repository verification pass required by project instructions:
```bash
RTK_DISABLED=1 pnpm verify:ai
```
Expected result: typecheck, lint, and tests pass for the workspace.

## Completion criteria
This task is complete only after every command above exits 0 and any fixes made during verification are covered by the relevant package tests.
