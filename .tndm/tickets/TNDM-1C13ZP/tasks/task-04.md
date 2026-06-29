# Task 4: code_context: evidence annotation for tests section

## Goal
Update the `buildTestsSection` function in `generate-context.ts` to read the new `DiscoverTestFilesResult.provenance` and render evidence annotations.

## Files
- `packages/supi-code-intelligence/src/use-case/generate-context.ts`

## Changes

In `buildTestsSection` (~L315–L360):

1. Destructure the new return type:
   ```ts
   const { files: discovered, provenance } = await discoverTestFilesForSource(targetAbs, { ... });
   ```

2. Replace conditional logic with table:

| Condition | Action |
|---|---|
| `discovered.length === 0` AND `provenance === "conventions-only"` | Return `{ lines: ["Tests unavailable — no semantic or structural provider available."], hasStructuralEvidence: false }` |
| `discovered.length === 0` AND `provenance === "semantic+conventions"` | Keep existing: `["No test companion files found for this target."]` |
| `discovered.length > 0` AND `provenance === "conventions-only"` | Prepend to lines: `"Tests (conventions-only — no LSP/TS):"` before file listing |
| `discovered.length > 0` AND `provenance === "semantic+conventions"` | Unchanged behavior |

3. For each test file with empty `testNames`: append `"no recognized test blocks"` after the file entry.

## Verification
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json` passes
- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts` — existing tests pass (Task 5 adds new assertions)
- Manual: `code_context` with a task and target shows test provenance when conventions-only
