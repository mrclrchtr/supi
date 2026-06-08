# Task 2: Replace test discovery with import-graph analysis

## Goal
Replace the two-path discovery pattern with single-mechanism import-graph analysis.

## File
`packages/supi-code-intelligence/src/analysis/relations/tests.ts`

## Change

### Remove
- `findTestFilesInNearestTestsDir()` function
- `scanTestsDirForCompanions()` function
- `ScanDirOptions` interface
- `scanDir()` function
- `readDirEntries()` function
- `processEntry()` function
- `getTestExt()` function

### Replace `findTestCompanionFiles()`

Current signature:
```ts
export function findTestCompanionFiles(targetAbs: string): string[]
```

New signature:
```ts
export async function findTestCompanionFiles(
  targetAbs: string,
  provider: { references: (uri: string) => Promise<Array<{ uri: string }>> }
): Promise<string[]>
```

New implementation:
```ts
export async function findTestCompanionFiles(
  targetAbs: string,
  provider: { references: (uri: string) => Promise<Array<{ uri: string }>> }
): Promise<string[]> {
  const refs = await provider.references(pathToFileURL(targetAbs).href);
  return refs
    .filter(ref => isTestFile(ref.uri))
    .map(ref => fileURLToPath(ref.uri));
}
```

Note: Use `pathToFileURL` and `fileURLToPath` from `node:url` for proper URI handling.

## Verification
- Function is async
- Uses provider.references
- Filters with isTestFile
- Returns absolute paths
