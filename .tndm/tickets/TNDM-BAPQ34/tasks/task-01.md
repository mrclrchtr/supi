# Task 1: RED: Write failing tests for collectReferences, aggregatePerTarget, formatReferenceList

Create `__tests__/unit/semantic-references.test.ts` with tests for all three helpers:

### collectReferences(target, cwd, semantic)
- Returns `{ refs, confidence: "semantic", externalCount }` when LSP returns locations
- Filters out the declaration location
- Partitions project vs external refs (external = not within cwd)
- Returns `{ refs: [], confidence: "unavailable", externalCount: 0 }` when LSP returns null
- Converts 0-based LSP positions to 1-based line numbers

### aggregatePerTarget(targets, collectFn)
- Maps over targets, calls collectFn for each, dedupes refs by file:line
- Returns merged confidence (semantic > structural > heuristic > unavailable)
- Sums externalCount across targets
- Empty targets array returns { refs: [], confidence: "unavailable", externalCount: 0 }

### formatReferenceList(lines, refs, maxResults, cwd)
- Groups refs by file into a Map
- Appends per-file sections with line numbers (capped at 5 lines per file)
- Caps total files shown at maxResults
- Appends omitted notice when files > maxResults
- No-op when refs is empty

Use `createPiMock` and `makeCtx` from `@mrclrchtr/supi-test-utils`. Mock `SemanticSubstrate` with a `references` vi.fn(). Use `describe.each` / `it.each` for edge cases.
