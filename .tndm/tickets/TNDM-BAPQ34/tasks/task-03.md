# Task 3: REFACTOR: Replace private helpers in callers-action.ts with shared imports

Refactor `callers-action.ts`:

1. Add import: `import { aggregatePerTarget, collectReferences, formatReferenceList } from "./semantic-references.ts";`
2. Replace `collectCallerRefs(target, params, cwd, semantic)` body with delegation to `collectReferences(target, cwd, semantic)` — keep the wrapper if callers-specific behavior is needed, otherwise inline the call
3. Replace `executeFileLevelCallers`'s per-target Promise.all + dedupe + merge loop with `aggregatePerTarget(targetGroup.targets, (t) => collectReferences(t, cwd, semantic))`
4. Replace `addRefList(lines, refs, cwd, maxResults)` call site with `formatReferenceList(lines, refs, maxResults, cwd)`
5. Delete private functions: `collectCallerRefs`, `groupRefsByFile`, `addRefList` (unless `collectCallerRefs` is kept as a thin wrapper for the `candidateCount` field — if so, inline `candidateCount` at the call site)
6. Delete unused imports that were only used by deleted functions
7. Remove `CallerRef` interface (unify with `FileLineRef` from `semantic-references.ts`), replace `CallerCollection` with `ReferenceCollection`

Ensure `formatTargetCallers` still compiles — it uses `result.candidateCount` which may move to `result.refs.length`.
