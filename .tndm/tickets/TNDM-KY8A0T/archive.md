# Archive

Post-review follow-up fixes applied after the initial implementation.

## Follow-up changes

1. **Choice preview layout** — Implemented side-by-side preview rendering on wide terminals (`width >= 80`) and stacked preview below on narrow terminals in `packages/supi-ask-user/src/ui/form-render.ts`.
2. **Dead code removal** — Removed unused `buildChoiceRows` export from `packages/supi-ask-user/src/ui/form-view.ts`.
3. **Navigation consolidation** — Removed duplicated `advanceAfterQuestion()` and routed post-answer advancement through `goNext()` in `packages/supi-ask-user/src/ui/form-component.ts`.
4. **Direct state queries** — Added `AskUserController.isOptionSelected()` and updated `form-view.ts` helpers to read selection state directly instead of deriving it from `controller.outcome()`.
5. **Defensive `stateFor` guard** — `AskUserController.stateFor()` now throws for unknown question IDs.
6. **Comment editor context** — Comment editors now display the question header or option label they apply to (`packages/supi-ask-user/src/ui/form-component.ts`, `packages/supi-ask-user/src/ui/form-render.ts`).
7. **Redundant unanswered lines** — Cleaned up `packages/supi-ask-user/src/render/result.ts` so `needs_discussion` summaries no longer emit both `Unanswered: X` and `X: Unanswered`.
8. **Unused parameter removal** — Removed the unused `kind` parameter from `resolveIndexes()` in `packages/supi-ask-user/src/normalize.ts`.

## Verification

- `RTK_DISABLED=1 pnpm vitest run packages/supi-ask-user/ -v` — 5 files, 94 tests passed.
- `pnpm exec tsc -b packages/supi-ask-user/tsconfig.json packages/supi-ask-user/__tests__/tsconfig.json` — TypeScript passed.
- `pnpm exec biome check packages/supi-ask-user --max-diagnostics=50` — no diagnostics.
- `RTK_DISABLED=1 pnpm verify:ai` — workspace verify passed: 191 passed / 2 skipped test files, 1925 passed / 4 skipped tests, all 18 packages pack-verified.

## Additional follow-up fixes (post-user review)

After presenting the review findings to the user via `ask_user`, the following decisions were applied:

1. **Document normalized `details.questions`** — Added a note in `packages/supi-ask-user/README.md` that `details.questions` is normalized internal state; consumers should rely on `responses` for answers.
2. **Public API cleanup** — Removed `buildResult`/`buildErrorResult` exports from `packages/supi-ask-user/src/ask-user.ts` since they were not re-exported by `api.ts`.
3. **Preview width guard** — Clamped `leftWidth` to a minimum in `packages/supi-ask-user/src/ui/form-render.ts` `renderChoiceWithPreview` for robustness at extreme narrow widths.
4. **Explicit last-question navigation** — Changed `goToLastQuestion()` in `packages/supi-ask-user/src/ui/form-component.ts` to use `questionnaire.questions.length - 1` explicitly.
5. **Per-question choice focus preservation** — Added `choiceFocusByQuestionId` map and `saveCurrentChoiceFocus()` so navigating backward/forward restores the previous focus position.
6. **Removed-fields wording alignment** — Updated `packages/supi-ask-user/README.md` and `packages/supi-ask-user/src/tool/guidance.ts` to list the same deprecated fields.
7. **`app.tools.expand` test coverage** — Extended `packages/supi-ask-user/__tests__/helpers/index.ts` to accept a keybinding matcher and added a unit test for the expand passthrough.
8. **Comment editor Esc behavior** — Changed `Esc` in question/option/form comment editors to close the editor and return to the form instead of cancelling the entire interaction.
9. **Tightened result helper type** — Narrowed `formatUnselectedOptionCommentLines` parameter to `ChoiceQuestionResponse` and removed the redundant `kind` check.
10. **Text unanswered stickiness** — Made controller text state authoritative in `form-component.ts`, so `Alt+U` on a recommended text question stays unanswered across review/revisit flows.
11. **Review edit return flow** — Added review-opened edit state so saving/advancing a question opened from Review returns to Review instead of walking through later questions.
12. **Comment Esc refresh and wording** — Requested a render after `Esc` exits comment editors, changed footer wording to `Esc discard`, and aligned README/CLAUDE notes.
13. **Form comment context** — Special-cased form comment headers to show `Review · form comment` instead of the current question counter.
14. **Choice unanswered indicator** — Added explicit `Marked unanswered; comments preserved.` status for choice questions after `u`, backed by controller state.
15. **Preview separator** — Added a muted vertical separator between choices and preview on wide terminals.
16. **Layout/design refresh** — Reworked the live form into a wizard-style rounded card with compact progress, slim choice rows, side/stacked preview cards, review summary cards, and fuller but cleaner key hints. Split shared render helpers into `form-render-primitives.ts` and review rendering into `form-review-render.ts`.

## Verification (updated)

- `RTK_DISABLED=1 pnpm vitest run packages/supi-ask-user/ -v` — 5 files, 114 tests passed.
- `pnpm exec tsc -b packages/supi-ask-user/tsconfig.json packages/supi-ask-user/__tests__/tsconfig.json` — TypeScript passed.
- `pnpm exec biome check packages/supi-ask-user --max-diagnostics=50` — no diagnostics.
- `RTK_DISABLED=1 pnpm verify:ai` — workspace verify passed: 191 passed / 2 skipped test files, 1945 passed / 4 skipped tests, all 18 packages pack-verified.

## Notes

- The repeated `outcome()` reconstruction finding (item 4 in the review) was intentionally skipped per review decision: the forms are small enough that the cost is negligible.
- Review default focus intentionally remains on the Submit row per user decision.
- Workspace Biome still emits pre-existing warnings outside `packages/supi-ask-user` during `verify:ai`; command exits successfully.
- `supi-ask-user` package-specific checks are clean.
