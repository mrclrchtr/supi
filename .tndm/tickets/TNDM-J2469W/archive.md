# Archive

All 5 tasks implemented and verified:

## Final verification

**Tests:** 64 pass (47 original + 17 new), 0 failures
**Biome:** Clean — no lint errors, no formatting issues
**TypeScript:** Clean — no type errors in source or test files

## Changes by task

| Task | File(s) | Status |
|---|---|---|
| 1. Per-file diff stats | `target/packet.ts` | ✅ Done — DiffSection has additions/deletions, counted during split |
| 2. File overview table | `target/packet.ts` | ✅ Done — ## File overview table with per-file +/- stats and trivial annotations |
| 3. Skip-list annotations | `target/packet.ts` | ✅ Done — classifySkipCategory() + skip annotations in overview table |
| 4. System prompt improvements | `tool/review-runner.ts` | ✅ Done — Finding calibration section + skipped files guardrail |
| 5. Severity-branching follow-up | `review.ts` | ✅ Done — 4 branches: critical/contradiction/major/minor-only |

## Output verification

File overview table for mixed source/skip files:
```
| File | +Add | -Del |
|---|---|---|
| src/auth.ts | 2 | 0 (trivial) |
| package-lock.json | 1 | 1 (trivial, skip — lockfile) |
| CHANGELOG.md | 1 | 1 (trivial, skip — changelog) |
| dist/bundle.js | 1 | 1 (trivial, skip — generated) |
```

System prompt includes calibration examples (priority 0-3, confidence, correctness) and skipped files guardrail (lockfiles, generated code, changelogs, snapshots, etc.).

Follow-up instruction branches correctly: critical → urgent ⚠️, major → standard, minor-only → light.
