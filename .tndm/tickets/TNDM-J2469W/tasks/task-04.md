# Task 4: Add calibration examples and skip-list to reviewer system prompt

Extend `buildReviewerSystemPrompt()` with two new sections:

**1. Finding calibration** — replace the bare priority/confidence lines with concrete examples:
- Priority 0 (info): style nits, naming suggestions, non-functional improvements
- Priority 1 (minor): unlikely edge cases, minor perf concerns without benchmarks
- Priority 2 (major): logic errors, incorrect error handling, API contract violations, race conditions
- Priority 3 (critical): security vulnerabilities, data loss, crashes, breaking changes
- Confidence 0.8-1.0: verified by reading surrounding code
- Confidence 0.5-0.8: suspected from diff, plausible but not fully verified
- Confidence <0.5: do not report
- overall_correctness meanings for each enum value

**2. Skip-list guardrail** — add to the Guardrails section:
Skip reviewing: lockfiles, generated/bundled code (dist/, .next/, __generated__/), vendored dependencies, changelogs, snapshot files, minified bundles, and binary files.

**TDD:** Write a unit test that verifies the system prompt contains the calibration section and skip-list guardrail.
