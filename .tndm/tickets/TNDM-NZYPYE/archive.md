# Archive

## Verification

### Test results
- 463 tests passing, 4 skipped
- 0 typecheck errors

### Fixes applied

1. **#1 (must-fix)** `line.indexOf(word)` bug fixed — shared `collectCallSitesInFile` uses `wordMatch.index`
2. **#2 (should-fix)** `baseRef` removed from surface.ts:117, CLAUDE.md, README.md
3. **#3 (should-fix)** `isDeclarationContext` filter added to shared call-sites module (used by both consumers)
4. **#4 (should-fix)** Stale docs updated: schemas.ts JSDoc, execute-refactor-plan.ts error message, CLAUDE.md/README.md operations/modes. Orphaned `destination` field removed.
5. **#5 (should-fix)** Dead `CALL_LIKE_KINDS`/`isCallLikeKind` removed from pattern-structured.ts
6. **#6 (should-fix)** Test helper `mode` type narrowed to `"apply"`
7. **#7 (consider)** Call-site search deduplicated — shared `src/analysis/relations/call-sites.ts` used by both pattern-structured.ts and execute-find.ts
8. **#8 (consider)** Unused `hasEvidence` variable removed from execute-graph.ts

### Files changed
- `src/analysis/relations/call-sites.ts` — NEW shared call-site matching module
- `src/pattern-structured.ts` — uses shared module, removed dead code
- `src/tool/execute-find.ts` — uses shared module, simplified
- `src/tool/execute-refactor-plan.ts` — updated error message
- `src/tool/execute-graph.ts` — removed unused `hasEvidence`
- `src/workflow/schemas.ts` — removed orphaned `destination`, updated JSDoc
- `src/workflow/surface.ts` — removed `baseRef` from schemaDocs
- `CLAUDE.md` — updated operations, modes, kinds
- `README.md` — updated operations, modes, baseRef
- `__tests__/helpers/execute-action.ts` — narrowed mode type
