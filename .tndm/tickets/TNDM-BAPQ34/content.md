# Extract shared semantic reference helpers

## Problem

`callers-action.ts` and `affected-action.ts` duplicate ~120 lines of near-identical logic:

1. **Reference collection** — `collectCallerRefs` (~30 lines) and `gatherReferences` (~25 lines) both call `semantic.references()`, filter out declaration, partition project/external refs, and return `{ file, line }` entries.
2. **Multi-target aggregation** — `executeFileLevelCallers` and `executeFileLevelAffected` both do `Promise.all(targets.map(...))` → `dedupeFileLineRefs` → `highestConfidence` → `reduce externalCount`.
3. **Reference formatting** — `addRefList` and `addReferencesSection` both group refs into `Map<string, number[]>`, render capped per-file line lists.

`implementations-action.ts` is NOT included — it uses `semantic.implementation()`, not `semantic.references()`.

## Approach

**A: Extract shared helpers** — one new internal module with three functions:

1. `collectReferences(target, cwd, semantic)` → `{ refs: FileLineRef[], confidence, externalCount }`
2. `aggregatePerTarget(targets, collectFn)` → `{ refs: FileLineRef[], confidence, externalCount }`
3. `formatReferenceList(lines, refs, maxResults, cwd)` — appends grouped ref lines

Both `callers-action.ts` and `affected-action.ts` import from `./semantic-references.ts` instead of having private copies.

No changes to `api.ts` or `index.ts` (internal helpers only). No changes to `implementations-action.ts`.

## Files

| File | Change |
|---|---|
| `src/actions/semantic-references.ts` | New file — the three shared helpers |
| `__tests__/unit/semantic-references.test.ts` | New file — TDD tests for all three helpers |
| `src/actions/callers-action.ts` | Import helpers, delete private `collectCallerRefs`, `addRefList`, shrink `executeFileLevelCallers` |
| `src/actions/affected-action.ts` | Import helpers, delete private `gatherReferences`, `addReferencesSection`, shrink `executeFileLevelAffected` |

## Constraints / non-goals

- No changes outside `supi-code-intelligence`
- No new public API exports
- No changes to `implementations-action.ts`, `callees-action.ts`, `brief-action.ts`, or `pattern-action.ts`
- Follows existing codebase patterns (same import style, same naming conventions)
- TDD by default