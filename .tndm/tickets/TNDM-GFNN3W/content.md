## Approved design summary

**Problem**
The bundled `code_intel` improvements are functionally correct, but the review surfaced seven non-blocking follow-ups: shared helper duplication, unbounded structured pattern scans, slightly misleading caller metadata naming, undocumented lightweight export-extraction limits, approximate file-level affected omission counts, missing tests for the live diagnostic mapping path, and some long inline formatting code.

**Approved scope**
Apply all seven follow-up fixes in the current ticket.

**Approach**
1. Extract shared helper utilities (`isResolvedTargetGroup`, confidence ranking, reference dedupe) into shared modules owned by the target-resolution/search domain.
2. Add bounds and partial-result reporting to structured `pattern` scans so `kind` searches cannot walk arbitrarily large trees silently.
3. Make caller metadata/output clearer by renaming or documenting total-vs-rendered reference counts.
4. Document the lightweight export extraction limits directly in code where they are relied on for recursive briefs.
5. Make file-level affected `omittedCount` precise.
6. Add automated coverage for the `loadDiagnostics` / `getOutstandingDiagnosticSummary` mapping path.
7. Extract or simplify the longest inline affected formatting logic as part of the same cleanup.

**Non-goals**
- No new user-facing behavior beyond the review follow-ups.
- No redesign of the broader `code_intel` architecture.
- No expansion of recursive brief export extraction into a full AST-accurate JS/TS export model.

**Why this approach**
This keeps the good behavior intact while addressing the review’s concrete maintainability, performance, and clarity concerns with bounded, testable follow-up edits.