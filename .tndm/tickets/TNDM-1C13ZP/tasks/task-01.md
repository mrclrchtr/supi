# Task 1: Shared test discovery: types, return change, name filtering, deletions

## Goal
Harden `src/analysis/relations/tests.ts` — the single shared test discovery helper used by `code_graph`, `code_impact`, and `code_context`.

## Files
- `packages/supi-code-intelligence/src/analysis/relations/tests.ts`

## Changes

### 1. New types
Add above `discoverTestFilesForSource`:
```ts
export type TestDiscoveryProvenance = "semantic+conventions" | "conventions-only";

export interface DiscoverTestFilesResult {
  files: DiscoveredTestFile[];
  provenance: TestDiscoveryProvenance;
}
```

### 2. Return type change
`discoverTestFilesForSource` returns `Promise<DiscoverTestFilesResult>` instead of `Promise<DiscoveredTestFile[]>`.

**Provenance logic:**
- If `options.references` is non-null AND found >=1 file via semantic refs → `"semantic+conventions"`
- Otherwise → `"conventions-only"`
- Track with a local boolean: `let semanticContributed = false`. Set true inside the references block when `refFiles.length > 0`.

### 3. Test name filtering
In `extractTestFunctionNames`: remove the `isTestF` shortcut on line ~253. Replace:
```ts
const isTestF = isTestFilePath(relPath);
return outlineResult.data
  .filter((item) => isTestF || isTestLikeName(item.name))
```
with:
```ts
return outlineResult.data
  .filter((item) => isTestLikeName(item.name))
```
This eliminates noisy names like `tmpDir`, `result`, `writeSource`.

### 4. Deletions
- Delete `extractTestFunctions` (entire function, L316–L347) — zero imports, zero references.
- Inline `findTestCompanionFiles` into `findReferenceTestFiles`: move the body of `findTestCompanionFiles` into `findReferenceTestFiles`, delete the standalone function and its JSDoc.
- Inline `findReferenceTestFiles` into `discoverTestFilesForSource` at L62–L63: replace the call with inline ref collection logic.
- Delete `isTestFile` (L289–L298) — only used by the now-deleted `findTestCompanionFiles`.
- Remove `findTestCompanionFiles` from exports if listed in any barrel.

Keep: `isTestFilePath`, `isTestSupportPath`, `isTestLikeName`.

### 5. Update `extractTestFunctions` callers
Search for any remaining callers of `extractTestFunctions` outside tests.ts — confirm none exist before deletion. The code_find results showed 0 imports.

## Verification
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json` passes
- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts` — existing tests pass after adapting to new return type (test file updates are in Task 5)
- Manual: confirm `extractTestFunctions`, `findTestCompanionFiles`, `isTestFile` are not imported anywhere in the workspace
