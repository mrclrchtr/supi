# Task 2: code_graph: evidence annotation for tests relation

## Goal
Update the `case "tests"` in `collectRelation` to read the new `DiscoverTestFilesResult.provenance` and render evidence annotations.

## Files
- `packages/supi-code-intelligence/src/tool/execute-graph.ts`

## Changes

In `collectRelation` → `case "tests"` (~L385–L430):

1. Destructure the new return type:
   ```ts
   const { files: discovered, provenance } = await discoverTestFilesForSource(file, { ... });
   ```

2. Replace `discovered.length === 0` check with table:

| Condition | Action |
|---|---|
| `discovered.length === 0` AND `provenance === "conventions-only"` | Return `kind: "unavailable"`, message: `"No test provider available — semantic and structural providers are absent"` |
| `discovered.length === 0` AND `provenance === "semantic+conventions"` | Keep existing: `kind: "ok"`, count: 0, content: "no companion test files found" |
| `discovered.length > 0` AND `provenance === "conventions-only"` | Header: `**Tests** (${count} files, conventions-only — no LSP/TS)` |
| `discovered.length > 0` AND `provenance === "semantic+conventions"` | Header unchanged: `**Tests** (${count} files)` |

3. For each test file with empty `testNames`: append `"no recognized test blocks"` after the file entry.

4. Import the `DiscoverTestFilesResult` type from tests.ts — only the type is needed, destructuring handles the rest.

No changes to other relations (`references`, `callees`, `implements`, `imports`, `exports`).

## Verification
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json` passes
- The existing `__tests__/unit/tool/execute-graph.test.ts` test file will be updated in Task 5; after Task 5, tests pass
- Manual: the refactored function compiles with the new `DiscoverTestFilesResult` destructuring
