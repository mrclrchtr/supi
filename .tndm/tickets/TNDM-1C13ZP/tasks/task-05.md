# Task 5: Tests: update existing tests and add evidence annotation test cases

## Goal
Update all test files to match the new types, behavior, and deletions. Add new test cases for evidence annotation.

## Files
- `packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts`

## Changes

### `relations-tests.test.ts`

1. Replace all `findTestCompanionFiles` calls with `discoverTestFilesForSource` calls, destructuring `{ files }`.
2. Update `discoverTestFilesForSource` assertions to destructure `{ files, provenance }`.
3. Add test: **conventions-only provenance** — call `discoverTestFilesForSource` without `references`, assert `provenance === "conventions-only"`.
4. Add test: **name filtering** — set up outline returning `[{ name: "tmpDir" }, { name: "describe" }, { name: "it loads" }]`, assert testNames contains only `["describe", "it loads"]`.
5. Remove any imports of `findTestCompanionFiles`, `extractTestFunctions`.
6. Verify `isTestFile` is no longer imported.

### `execute-graph.test.ts`

1. Update test cases that call `discoverTestFilesForSource` mock to return `{ files: [...], provenance: "semantic+conventions" }`.
2. Add test: **tests relation unavailable** — when `provenance === "conventions-only"` and files=0, expect output containing "No test provider available".
3. Add test: **conventions-only rendering** — when files>0 and `provenance === "conventions-only"`, expect "conventions-only — no LSP/TS" in output.
4. Add test: **empty test names** — when a discovered file has `testNames: []`, expect "no recognized test blocks" in output.

### `code-context-tool.test.ts`

1. Update test cases using `discoverTestFilesForSource` mock to return `{ files: [...], provenance }`.
2. Add test: **tests section unavailable** — conventions-only with 0 files.
3. Add test: **conventions-only rendering** — conventions-only with files > 0.

### `code-impact-tool.test.ts`

1. Update any test cases using `discoverTestFilesForSource` mock.
2. Add test: **changedFiles evidence note** — changedFiles output contains "Evidence: structural".
3. Add test: **test provenance annotation** — when includeTests and conventions-only, output contains "conventions-only — no LSP/TS".

## Verification
- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts` passes
- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts` passes
- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts` passes
- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts` passes
