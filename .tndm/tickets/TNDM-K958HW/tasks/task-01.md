# Task 1: Add targeting query/types layer with failing normalization tests

## Goal
Create the new targeting module entry types and query normalization layer so the rest of the refactor can depend on one explicit target-query shape.

## Files
- create `packages/supi-code-intelligence/src/targeting/types.ts`
- create `packages/supi-code-intelligence/src/targeting/query.ts`
- create `packages/supi-code-intelligence/__tests__/unit/targeting-query.test.ts`
- update `packages/supi-code-intelligence/__tests__/unit/target-resolution.test.ts` only if imports need temporary compatibility adjustments

## Change
1. Start RED by adding focused tests for query normalization/routing:
   - anchored query when `file + line + character` are present
   - file-surface query when `file` is present without coordinates
   - symbol query when `symbol` is present
   - explicit invalid/no-target case for semantic actions with neither `file` nor `symbol`
2. Add exported JSDoc’d types for:
   - normalized query union
   - resolver dependency bag (`semantic`, `structural`, `cwd` as needed)
   - typed outcomes shared by the resolver modules
3. Implement the minimal normalization helper in `src/targeting/query.ts` to make the RED tests pass.
4. Keep public tool behavior unchanged; this task is internal scaffolding only.

## Verification
- RED: `pnpm exec vitest run packages/supi-code-intelligence/__tests__/unit/targeting-query.test.ts`
  - expect failure before implementation because the new module/types do not exist yet
- GREEN: rerun the same command and expect all tests to pass
- Type safety: `pnpm exec tsc --noEmit -p packages/supi-code-intelligence/__tests__/tsconfig.json`

## TDD
Required. Do not write `src/targeting/query.ts` until the new test file exists and fails for the missing-module / missing-export reason.
