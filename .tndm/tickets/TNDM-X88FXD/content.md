Unify the three structured question types (choice, multichoice, yesno) in supi-ask-user into a single `choice` type with a `multi: boolean` discriminator.

## Design

### External schema (LLM-facing)
- Single `ChoiceQuestionSchema` replaces `ChoiceQuestionSchema`, `MultiChoiceQuestionSchema`, `YesNoQuestionSchema`
- New `multi: boolean` field (default `false`) controls single vs multi-select
- `recommendation` and `default` become `string | string[]` union types — string for single, array for multi
- Yes/no options must be explicit (no auto-generation)

### Internal types
- `NormalizedChoiceQuestion`, `NormalizedMultiChoiceQuestion`, `NormalizedYesNoQuestion` → single `NormalizedChoiceQuestion` with `multi: boolean`
- `OptionAnswer`, `OptionsAnswer`, `YesNoAnswer` → single `ChoiceAnswer` with `selections: Selection[]`
  - Single-select: selections has 1 element
  - Multi-select: selections has 1+ elements

### Normalizer
- `normalizeChoice`, `normalizeMultiChoice`, `normalizeYesNo` → single `normalizeChoice`
- `resolveSingleRecommendation` + `resolveMultiRecommendation` → single function handling both string and array
- Remove `YES_NO_OPTIONS` constant
- Hard cut on old type names — schema validation rejects "yesno" and "multichoice"

### UI
- `question.type === "multichoice"` → `question.multi`
- Remove `question.type === "yesno"` branches (same as single choice)
- Answer source "option" and "yesno" → "choice"

### Format/result
- Merge "option" + "yesno" switch cases → "choice"
- "options" case stays distinct but operates on same `ChoiceAnswer.selections`

### Backward compat
- Hard cut — old type names cause schema validation errors. Model guidance updated to only mention "choice".