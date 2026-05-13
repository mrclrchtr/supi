- [x] **Task 1**: Rewrite external schema — unified ChoiceQuestionSchema
  - File: `packages/supi-ask-user/src/schema.ts`
  - Changes: Remove `ChoiceQuestionSchema`, `MultiChoiceQuestionSchema`, `YesNoQuestionSchema`. Add single `ChoiceQuestionSchema` with `multi: Type.Optional(Type.Boolean({ default: false }))`. Change `recommendation` and `default` to `Type.Union([Type.String(), Type.Array(Type.String())])`. Update `QuestionSchema` union to `[ChoiceQuestionSchema, TextQuestionSchema]`. Update exported types removing `ExternalChoiceQuestion`, `ExternalMultiChoiceQuestion`, `ExternalYesNoQuestion`.
  - Verification: Manual review that the schema is correct. Will not typecheck until downstream code is updated.

- [x] **Task 2**: Rewrite internal types — unified NormalizedChoiceQuestion and ChoiceAnswer
  - File: `packages/supi-ask-user/src/types.ts`
  - Changes: Remove `NormalizedChoiceQuestion`, `NormalizedMultiChoiceQuestion`, `NormalizedYesNoQuestion`. Add `NormalizedChoiceQuestion` extending `StructuredQuestionBase` with `multi: boolean`. Remove `OptionAnswer`, `OptionsAnswer`, `YesNoAnswer`. Add `ChoiceAnswer` with `{ source: "choice", selections: { value: string, optionIndex: number, note?: string }[] }`. Update `NormalizedQuestion`, `NormalizedStructuredQuestion`, `Answer` unions. Update `isStructuredQuestion` (only `text` is non-structured now). Remove `primaryRecommendationIndex` if unused.
  - Verification: Manual review that types are consistent with schema. Will not typecheck until downstream code is updated.

- [x] **Task 3**: Rewrite normalizer — unified normalizeChoice
  - File: `packages/supi-ask-user/src/normalize.ts`
  - Changes: Remove `normalizeChoice`, `normalizeMultiChoice`, `normalizeYesNo`, `YES_NO_OPTIONS` constant. Add unified `normalizeChoice` handling both single/multi via the `multi` field. Remove `resolveSingleRecommendation`, `resolveMultiRecommendation`, `resolveSingleDefault`, `resolveMultiDefault` — replace with single `resolveRecommendation` and `resolveDefault` that accept `string | string[]`. Update `normalizeQuestion` switch to only handle `"choice"` and `"text"`. Remove import of `ExternalChoiceQuestion`, etc.
  - Verification: Manual review that normalization paths are correct.

- [x] **Task 4**: Rewrite format — merge answer formatting branches
  - File: `packages/supi-ask-user/src/format.ts`
  - Changes: In `formatSummaryBody` and `formatReviewLines`, merge `"option"` and `"yesno"` cases into single `"choice"` case. Update `"options"` case to also use `"choice"` source but handle multi-select (check `selections.length`). Update `formatReviewLine` if needed. Remove `resolveSelections`, `legacySelections` — no longer needed since `ChoiceAnswer.selections` always carries resolved selections.
  - Verification: Manual review that all format paths produce correct output.

- [x] **Task 5**: Update flow — merge answer normalization branches
  - File: `packages/supi-ask-user/src/flow.ts`
  - Changes: In `normalizeAnswer`, merge `"option"` and `"yesno"` cases into single `"choice"` case. Update `"options"` case to produce `ChoiceAnswer` shape. Update imports from types.
  - Verification: Manual review of normalizeAnswer function.

- [x] **Task 6**: Update result + render
  - Files: `packages/supi-ask-user/src/result.ts`, `packages/supi-ask-user/src/render.ts`
  - Changes: In `result.ts`, update any format calls referencing old answer types. In `render.ts`, update `renderAskUserCall` header extraction and `renderAskUserResult` if needed. These files have minimal type-specific logic.
  - Verification: Manual review.

- [x] **Task 7**: Update UI — state, handlers, render notes
  - Files: `packages/supi-ask-user/src/ui/ui-rich-state.ts`, `packages/supi-ask-user/src/ui/ui-rich-handlers.ts`, `packages/supi-ask-user/src/ui/ui-rich-render-notes.ts`, `packages/supi-ask-user/src/ui/ui-rich-render.ts`
  - Changes: Replace `question.type === "multichoice"` with `question.multi` throughout. In `ui-rich-handlers.ts`, remove `question.type === "yesno"` branch in `handleOptionRow` — single-select choices (regardless of original type) all go through the same path producing a `ChoiceAnswer` with one selection. In `handleSubmitSelections`, change guard from `question.type !== "multichoice"` to `!question.multi`. In `ui-rich-state.ts`, update `interactiveRows`, `clearStructuredDrafts` guard, `selectedIndexesForQuestion`, `selectedRowIndex`. In `ui-rich-render-notes.ts`, update `currentRowSupportsNotes` guard. In `ui-rich-render.ts`, update any multi-related checks.
  - Verification: Manual review of each file.

- [x] **Task 8**: Update ask-user.ts — tool description, guidelines, re-exports
  - File: `packages/supi-ask-user/src/ask-user.ts`
  - Changes: Rewrite `TOOL_DESCRIPTION` to remove yesno/multichoice terminology — only mention `choice` and `text`. Rewrite `PROMPT_GUIDELINES` similarly. Update imports from schema/types (remove removed exports). Update `treeSummaryLabel` if needed. The `executeAskUser` and `driveQuestionnaire` functions should need minimal changes since they operate on `NormalizedQuestionnaire`.
  - Verification: Manual review of description and guidelines for consistency with new schema.

- [x] **Task 9**: Update tests — remove all yesno/multichoice references
  - Files: All `packages/supi-ask-user/__tests__/*.ts`
  - Changes: Replace `type: "yesno"` with `type: "choice"` + explicit yes/no options in test data. Replace `type: "multichoice"` with `type: "choice", multi: true`. Update answer shapes in assertions: `OptionAnswer` → `ChoiceAnswer` with single-element selections, `OptionsAnswer` → `ChoiceAnswer` with multi-element selections, `YesNoAnswer` → `ChoiceAnswer`. Update `source: "option"` → `source: "choice"`, `source: "yesno"` → `source: "choice"`, `source: "options"` → `source: "choice"`. Update `recommendation` and `default` test values as needed (string for single, array for multi). Remove tests that specifically test yesno auto-generation (since it no longer exists). Update mock factories in tests that import from types.
  - Verification: `pnpm vitest run packages/supi-ask-user/` — all tests pass.

- [x] **Task 10**: Update README
  - File: `packages/supi-ask-user/README.md`
  - Changes: Replace all yesno/multichoice documentation with the unified `choice` type. Document the `multi` field. Update examples.
  - Verification: Manual review.

- [x] **Task 11**: Full verification sweep
  - Commands:
    - `pnpm exec tsc --noEmit -p packages/supi-ask-user/tsconfig.json` — source typecheck passes
    - `pnpm exec tsc --noEmit -p packages/supi-ask-user/__tests__/tsconfig.json` — test typecheck passes
    - `pnpm vitest run packages/supi-ask-user/` — all tests pass
    - `pnpm exec biome check packages/supi-ask-user/` — no lint/format issues
  - Verification: All four commands exit 0.
