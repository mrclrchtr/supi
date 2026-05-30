# Implementation overview: supi-review in-app full-preview inspector

## Scope check
This plan covers a single subsystem: the pre-run review-plan preview in `packages/supi-review`. It does not branch into review synthesis, reviewer execution, or result rendering, so it should stay as one coherent implementation.

## Approach
Replace the external pager path with a stateful in-app inspector that stays inside the existing `previewReviewPlan()` interaction.

The preview should have two layers of interaction:
- **Summary screen** — the current approval view remains the entry point.
- **Inspector screen** — opened from `v`, defaults to **Overview**, and allows switching to **Raw Prompt** in the same viewer.

Key behavioral rules:
- `v` opens the inspector from the summary screen.
- Overview is the default inspector mode.
- Raw Prompt is available as an in-app mode toggle, not a nested dialog.
- `q` / `esc` from the inspector returns to the summary screen.
- `enter` / `y` approve only from the summary screen.
- `esc` / `n` cancel only from the summary screen.
- `e` exports the raw prompt to a temp file and surfaces the path as a debug fallback.
- No prompt editing and no external pager dependency.

## File map
- `packages/supi-review/src/target/packet.ts`
  - expose a shared structured preview helper for audit hints, file overview rows, and snapshot notes so the inspector can render Overview mode without scraping the raw prompt string
  - keep `buildReviewPacket()` prompt semantics unchanged
- `packages/supi-review/src/ui/flow.ts`
  - keep the review-flow entry points and approval/cancel wiring
  - route `v` to the in-app inspector instead of spawning `less`
- `packages/supi-review/src/ui/review-plan-inspector.ts` **(new)**
  - own the preview state machine, inspector mode switching, scrolling, and export action
  - keep this logic out of `flow.ts`, which is already large enough that adding another substantial component there would be hard to maintain
- `packages/supi-review/__tests__/unit/packet.test.ts`
  - cover the shared preview helper shape and keep packet generation aligned with the inspector overview data
- `packages/supi-review/__tests__/unit/review-plan-inspector.test.ts` **(new)**
  - cover the inspector interaction model directly: open, mode switch, scroll, return-to-summary, cancel semantics, and export callback behavior
- `packages/supi-review/README.md`
  - document the new in-app inspector behavior and shortcuts
- `packages/supi-review/CLAUDE.md`
  - update package structure and maintainer notes for the new UI file and the removal of the external pager dependency

## Implementation notes
- Reuse packet-derivation logic for Overview mode instead of recomputing or parsing the final prompt blob.
- Keep the inspector read-only. This is an inspection tool, not a prompt editor.
- Prefer a dedicated UI component file over expanding `flow.ts` further.
- Treat a third inspector mode such as Files/Audit as optional only if it falls out naturally from the shared preview helper without adding extra complexity; it is not required for this plan.

## Verification strategy
Use TDD for code changes:
1. add failing packet helper coverage
2. implement the shared preview helper and keep packet tests green
3. add failing inspector interaction tests
4. implement the inspector UI and flow wiring
5. update docs
6. run package-level tests, typecheck, lint, and a manual Pi smoke test confirming there is no `less` handoff anymore

## Constraints / non-goals
- Keep the change local to `packages/supi-review`.
- Do not change reviewer prompt semantics beyond sharing preview data.
- Do not add prompt editing.
- Do not redesign the rest of `/supi-review`.
