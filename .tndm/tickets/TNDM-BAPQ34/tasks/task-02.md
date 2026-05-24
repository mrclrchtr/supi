# Task 2: GREEN: Implement semantic-references.ts with three shared helpers

Create `src/actions/semantic-references.ts` with three exported functions:

### `collectReferences(target, cwd, semantic): Promise<ReferenceCollection>`
```ts
interface FileLineRef { file: string; line: number; }
interface ReferenceCollection {
  refs: FileLineRef[];
  confidence: ConfidenceMode;
  externalCount: number;
}
```
- Calls `semantic.references(target.file, target.position)`
- If null → returns `{ refs: [], confidence: "unavailable", externalCount: 0 }`
- Filters out declaration via `filterOutDeclaration(locs, target.file, target.position)`
- Counts external refs (not in project path)
- Collects project refs as `{ file: relativePath, line: start.line + 1 }`
- Returns `{ refs: projectRefs, confidence: "semantic", externalCount }`

### `aggregatePerTarget(targets, collectFn): Promise<AggregatedCollection>`
```ts
interface AggregatedCollection {
  refs: FileLineRef[];
  confidence: ConfidenceMode;
  externalCount: number;
}
```
- `targets: ResolvedTarget[]`, `collectFn: (target: ResolvedTarget) => Promise<ReferenceCollection>`
- `Promise.all(targets.map(collectFn))`
- Flattens refs, dedupes via `dedupeFileLineRefs`
- Merges confidence via `highestConfidence`
- Sums `externalCount`

### `formatReferenceList(lines, refs, maxResults, cwd): void`
- Groups refs by file into `Map<string, number[]>`
- For each file (up to `maxResults`): appends `### file`, then up to 5 line numbers, then omitted notice if >5
- If files > maxResults: appends `_+N more files omitted_` notice
- Quiet no-op when refs is empty

Use existing imports from `../search-helpers.ts` (`filterOutDeclaration`, `isInProjectPath`, `uriToFile`), `../semantic-action-helpers.ts` (`dedupeFileLineRefs`, `highestConfidence`), `../substrates/types.ts` (`SemanticSubstrate`), `../target-resolution.ts` (`ResolvedTarget`), `../types.ts` (`ConfidenceMode`).
