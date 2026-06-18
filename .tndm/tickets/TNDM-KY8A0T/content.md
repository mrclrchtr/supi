# Design: Redesign `supi-ask-user` form UX and result contract

## Problem
`packages/supi-ask-user` currently lets `Enter` on a multi-select choice pass through selection semantics before submission. If the focused option is already selected, `Enter` can unselect it. The deeper issue is that the current UX mixes selection, exceptional action rows, partial submit, and discussion exits in a way that makes the tool harder to reason about.

## Scope
This is a hard-cut breaking redesign of `@mrclrchtr/supi-ask-user`. No compatibility shims are required for old tool-call fields or old persisted result details.

The redesigned `ask_user` remains a compact blocking decision form, but it becomes a clearer form workflow with comments at every level and a review screen before submission.

## External tool schema
Keep:
- `title?: string`
- `intro?: string`
- `questions: Array<choice | text>`

Remove:
- `required`
- `initial`
- `allowOther`
- `allowPartialSubmit`

Choice question fields:
- `type: "choice"`
- `id`, `header`, `prompt`
- `options: Array<{ value, label, description?, preview? }>`
- `multi?: boolean`
- `recommendation?: string | string[]`

Choice recommendation rules:
- single-select: `recommendation` must be a string when present; if absent, the first option is preselected
- multi-select: `recommendation` must be an array when present; if absent, no options are selected
- users can mark a question unanswered with `u`, even when a single-select default is preselected

Text question fields:
- `type: "text"`
- `id`, `header`, `prompt`
- `recommendation?: string`
- `placeholder?: string`

Text recommendation rules:
- `recommendation` is prefilled suggested text
- whitespace-only text is unanswered

Deprecated fields are rejected during normalization so old model calls fail clearly instead of being silently accepted.

## Result shape
Successful user submissions return only these outcomes:

```ts
interface AskUserOutcome {
  outcome: "submitted" | "needs_discussion";
  comment?: string;
  responses: AskUserResponse[];
}

type AskUserResponse = ChoiceQuestionResponse | TextQuestionResponse;

interface ChoiceQuestionResponse {
  questionId: string;
  questionComment?: string;
  answer: {
    kind: "choice";
    answered: boolean;
    options: Array<{
      value: string;
      label: string;
      selected: boolean;
      comment?: string;
    }>;
  };
}

interface TextQuestionResponse {
  questionId: string;
  questionComment?: string;
  answer: {
    kind: "text";
    answered: boolean;
    value?: string;
  };
}
```

Rules:
- `responses` includes every question in the original order
- choice `options` includes only touched options: selected options and/or options with comments
- `submitted` means every question has a structured answer
- `needs_discussion` means one or more questions are unanswered
- `comment` is the form-level comment
- `questionComment` is the per-question comment
- option comments live on option response objects
- `cancelled` and `aborted` are not persisted user-response outcomes; they are internal control-flow results that abort the agent turn

## UX
Use the existing compact custom UI surface, redesigned as a tabbed form with a review screen.

Keyboard model:
- `Tab` jumps to the next question; from the last question it jumps to review
- `Shift+Tab` jumps to the previous question; from review it returns to the last question
- `↑↓` moves focus within the current question or review list
- `Space` selects/toggles the focused choice option
- `Enter` on a single-select choice selects the focused option and advances
- `Enter` on a multi-select choice accepts current selections and advances without toggling anything
- `Enter` on a text/comment editor saves text and advances or returns to the previous screen
- `Enter` on review submits the form
- `u` marks the current choice question unanswered while preserving comments; `Alt+U` does this from a text editor
- `c` edits the current choice question comment; `Alt+C` does this from a text editor; on review `c` edits the form-level comment
- `n` edits the focused option comment, whether or not the option is selected
- `Esc` cancels/aborts the current agent turn

The final question always moves to review rather than submitting immediately. The review screen shows answered/unanswered state and provides the form-level comment path.

## File map
- `packages/supi-ask-user/src/schema.ts` — model-facing TypeBox schema; remove deprecated fields and add text recommendation
- `packages/supi-ask-user/src/types.ts` — normalized question types, response types, successful outcome type, and internal cancellation result type
- `packages/supi-ask-user/src/normalize.ts` — validation, deprecated-field rejection, recommendation/default lowering
- `packages/supi-ask-user/src/session/controller.ts` — source of truth for selections, text values, form/question/option comments, unanswered state, navigation, and derived outcome
- `packages/supi-ask-user/src/ui/types.ts` — UI runner result types and form args
- `packages/supi-ask-user/src/ui/form-component.ts` — keyboard orchestration for question screens, comment editors, review screen, cancel/abort handling
- `packages/supi-ask-user/src/ui/form-view.ts` — row and tab/review view models for choices, text, comments, and review
- `packages/supi-ask-user/src/ui/form-render.ts` — compact form/review rendering and footer hints
- `packages/supi-ask-user/src/ui/form-actions.ts` — remove if no longer used after action rows disappear
- `packages/supi-ask-user/src/ui/form.ts` and `packages/supi-ask-user/src/ui/choose-renderer.ts` — adapt runner to successful outcomes plus internal cancel/abort results
- `packages/supi-ask-user/src/ask-user.ts` — tool execution boundary, abort behavior, tree summary, and result construction
- `packages/supi-ask-user/src/render/result.ts` — model-visible content for new response shape
- `packages/supi-ask-user/src/render/transcript.ts` — collapsed/expanded TUI rendering for new response shape
- `packages/supi-ask-user/src/render/tree-summary.ts` — keep current label behavior unless type changes require adjustment
- `packages/supi-ask-user/src/api.ts` and `packages/supi-ask-user/src/index.ts` — public exports for renamed/removed types
- `packages/supi-ask-user/src/tool/guidance.ts` — concise model guidance for the new contract
- `packages/supi-ask-user/README.md` — user-facing schema, behavior, result, and keyboard documentation
- `packages/supi-ask-user/CLAUDE.md` — maintainer-facing package contract notes
- `packages/supi-ask-user/__tests__/unit/*.ts` — update normalization, controller, tool execution, transcript, and form tests

## Verification strategy
Use TDD for behavior changes:
1. write failing tests for the new contract and keyboard behavior
2. implement the smallest code to pass
3. refactor while staying green

Finish with:

```bash
RTK_DISABLED=1 pnpm verify:ai
```

## Non-goals
- no full-screen takeover
- no mini-chat inside the form
- no custom `Other…` answer path
- no `required` / optional distinction
- no `allowPartialSubmit` gate
- no backward compatibility for old schema/result shapes
