# Improve supi-review prompt pipeline

Four targeted improvements to the reviewer prompt quality and post-review UX.

## 1. Finding severity/confidence calibration

**Problem:** The reviewer system prompt lists priority/confidence ranges without examples. Different models score differently.

**Change:** Extend `buildReviewerSystemPrompt()` in `tool/review-runner.ts` with calibration examples per level (priority 0-3 with concrete examples, confidence tied to verification effort, overall_correctness meanings).

## 2. File overview table for omitted diffs

**Problem:** When many files are omitted from inline diffs (budget exhausted), the reviewer sees only flat filenames — no size indication.

**Change:** Compute per-file additions/deletions from diff text in `splitDiffSections()` (`target/packet.ts`). Add a `## File overview` table showing all changed files with +/- stats. Annotate trivial files (<5 total lines).

## 3. Skip-list for generated/vendored files

**Problem:** Reviewer wastes tokens on lockfiles, snapshots, changelogs.

**Change:** Add static skip-list to `buildReviewerSystemPrompt()` guardrails. Annotate matching files in the file overview table with `(skip — lockfile)` etc. Use filename pattern matching in `target/packet.ts`.

## 4. Smart follow-up based on severity

**Problem:** `buildReviewFollowUpInstruction()` always outputs the same text regardless of finding severity.

**Change:** Replace with branching logic in `review.ts`: critical findings → urgent tone, minor-only → light prompt, "patch is correct" + findings → note contradiction.

## Files

| File | Change |
|---|---|
| `tool/review-runner.ts` | Calibration section + skip-list guardrail |
| `target/packet.ts` | DiffSection stats, file overview table, skip annotations |
| `review.ts` | Severity-branching follow-up instruction |

## Non-goals

- No new settings or UI changes
- No model selection changes
- No re-review awareness (future feature)

## Verification

- Unit tests for per-file diff stat computation
- Unit tests for follow-up branching (critical/major/minor/contradiction paths)
- Updated integration test snapshots for reviewer prompt
- Manual `/supi-review` on a multi-file branch
