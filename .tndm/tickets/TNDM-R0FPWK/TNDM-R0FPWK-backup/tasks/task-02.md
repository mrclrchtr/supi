# Task 2: Expose snapshot inspection tools in the review child session

## Goal
Give the read-only reviewer session on-demand access to the selected snapshot without expanding the initial prompt.

## Changes
- Create `packages/supi-review/src/tool/snapshot-tools.ts` with reviewer-only custom tools for:
  - reading a changed file's snapshot diff
  - reading a changed file's `before` or `after` contents
- Keep tool inputs narrow and validate that requested files belong to `snapshot.changedFiles`.
- Return clear tool output for unsupported states (for example, no `before` content for an untracked file).
- Update `packages/supi-review/src/tool/review-runner.ts` to:
  - register the new custom tools alongside `submit_review`
  - include their names in the allowed tool list if needed by the runner wiring
  - update tool activity labels/progress text
  - revise `buildReviewerSystemPrompt()` so the reviewer is told to fetch diffs/context on demand instead of expecting inline diff blocks
- Extend `packages/supi-review/src/tool/schemas.ts` only as needed for tool parameter validation and result structure.

## Tests first
- Add direct unit coverage for the new tool module in `packages/supi-review/__tests__/unit/snapshot-tools.test.ts`.
- Extend `packages/supi-review/__tests__/unit/runner.test.ts` so it fails until the new tools are registered and the reviewer prompt mentions the new workflow.

## Done when
The reviewer child session has explicit snapshot tools, their access is constrained to changed files, and the runner tests prove the new tool surface is available.
