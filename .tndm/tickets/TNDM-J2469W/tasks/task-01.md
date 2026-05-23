# Task 1: Compute per-file diff stats in splitDiffSections

Add `additions` and `deletions` number fields to the `DiffSection` interface.

Update `splitDiffSections()` to count `+` and `-` lines per diff section during parsing. Only count actual diff lines (lines starting with `+` that aren't `+++`, lines starting with `-` that aren't `---`).

Export the updated `DiffSection` type so tests can import it.

**TDD:** Write a unit test first with a multi-file diff input and assert each section has correct add/del counts.

