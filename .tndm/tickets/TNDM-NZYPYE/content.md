# Fix code review findings

8 fixes in order of dependency:

1. Create shared `src/analysis/relations/call-sites.ts` with `collectCallSitesInFile()` — correct regex-based matching + `isDeclarationContext` filter
2. Update `pattern-structured.ts` to use shared function (fixes #1, #3, #5)
3. Update `execute-find.ts` to use shared function (fixes #7)
4. Remove stale `baseRef` from surface.ts, README.md, CLAUDE.md (#2)
5. Update docs in schemas.ts, execute-refactor-plan.ts, CLAUDE.md, README.md; remove orphaned `destination` field (#4)
6. Narrow test helper `mode` type (#6)
7. Remove unused `hasEvidence` in execute-graph.ts (#8)
