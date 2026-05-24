# Task 4: REFACTOR: Replace private helpers in affected-action.ts with shared imports

Refactor `affected-action.ts`:

1. Add import: `import { aggregatePerTarget, collectReferences, formatReferenceList } from "./semantic-references.ts";`
2. Replace `gatherReferences(target, params, cwd, semantic)` body with delegation to `collectReferences(target, cwd, semantic)` — note that `gatherReferences` doesn't filter declaration for external counting (it counts all refs for external, then filters for project). Verify `collectReferences` handles this identically by reviewing the implementation (it already does: counts externals from all refs, then collects project from filtered).
3. Replace `executeFileLevelAffected`'s per-target Promise.all + dedupe + merge loop with `aggregatePerTarget(targetGroup.targets, (t) => collectReferences(t, cwd, semantic))`
4. Replace `addReferencesSection(lines, refs, maxFiles)` call site with `formatReferenceList(lines, refs, maxFiles, cwd)`
5. Delete private functions: `gatherReferences`, `addReferencesSection`
6. Remove `GatheredRef` interface (unify with `FileLineRef`)
7. Delete unused imports that were only used by deleted functions
8. Remove `// biome-ignore-all lint/nursery/noExcessiveLinesPerFile` comment at top if file is now under the limit

Verify the `analyzeImpact` function still receives the correct shape — it takes `{ refs, confidence, externalCount }` which matches the unified return type.
