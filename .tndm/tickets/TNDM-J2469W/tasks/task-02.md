# Task 2: Add file overview table to review packet

In `buildReviewPacket()`, add a `## File overview` section after `## Changed files manifest` and before `## Included diffs`.

Format as a markdown table:
```
| File | +Add | -Del |
|---|---|---|
| src/foo.ts | 120 | 30 |
| CHANGELOG.md | 1 | 1 (trivial) |
```

Mark files as `(trivial)` when total line changes (additions + deletions) < 5.

Use the stats from `DiffSection` computed in Task 1.

**TDD:** Write a unit test that verifies the generated packet contains a file overview table with correct stats and trivial annotations.
