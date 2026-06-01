# Task 5: Final verification: full test suite, typecheck, and lint

## Goal
Confirm all four fixes work together end-to-end with no regressions.

## Verification commands (run in order)

### 1. Full unit test suite
```bash
pnpm vitest run packages/supi-code-intelligence/
```
All 444+ tests must pass (may have more with new tests).

### 2. Typecheck
```bash
pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
```
Must exit 0 with no errors.

### 3. Lint
```bash
pnpm exec biome check packages/supi-code-intelligence/
```
Must pass (no newly introduced lint errors).

### 4. Orphan reference sweep
```bash
rg "direction.*in.*out|depth.*Number|maxNodes.*Number" packages/supi-code-intelligence/src/ --no-heading
```
Must return no results (confirm removed params have no orphan references in source).

```bash
rg '"direction"|"depth"|"maxNodes"' packages/supi-code-intelligence/src/ --no-heading
```
Only acceptable hits: comments explaining removal, references in `tool-specs.ts` description/guidelines (if intentionally kept). Otherwise, must return no results.

### 5. Manual smoke test of code_impact test detection
Open the codebase and verify conceptually:
- `findLikelyTests` with affected file `"src/tool-specs.ts"` would NOT return it as a test file
- `findLikelyTests` with affected file `"src/foo.test.ts"` WOULD return it

### 6. Workspace health
```bash
pnpm verify:ai
```
Must pass (or report only pre-existing issues, no newly introduced failures).

## Exit criteria
All commands exit 0. No regressions in existing behavior.
