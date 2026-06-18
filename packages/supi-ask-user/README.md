<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-ask-user">
    <picture>
      <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-ask-user/assets/logo.png" alt="SuPi" width="50%">
    </picture>
  </a>
</div>

# @mrclrchtr/supi-ask-user

Adds a redesigned `ask_user` tool to the [pi coding agent](https://github.com/earendil-works/pi). It lets the model pause and request a small decision form when explicit human input is required.

## Install

```bash
pi install npm:@mrclrchtr/supi-ask-user
```

For local development:

```bash
pi install ./packages/supi-ask-user
```

![ask_user form](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-ask-user.png)

![ask_user choice with preview](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-ask-user-2.png)

## What you get

After install, pi gets one new tool:

- **`ask_user`** — open a blocking decision form during a run

The tool presents a structured questionnaire in the TUI form and blocks the agent turn until the user responds. It is designed for focused decisions, **not** long surveys or open-ended discovery.

Typical use cases:

- Clarify a narrow implementation choice
- Confirm a risky or destructive action
- Ask for a preference the repo cannot answer
- Gather one short cluster of related decisions before proceeding

## Package surfaces

- `@mrclrchtr/supi-ask-user/extension` — pi extension entrypoint, registers the `ask_user` tool
- `@mrclrchtr/supi-ask-user/api` — reusable types and utilities

Example:

```ts
import { normalizeQuestionnaire, AskUserController } from "@mrclrchtr/supi-ask-user/api";

const questionnaire = normalizeQuestionnaire(params);
const controller = new AskUserController(questionnaire);
```

## Request shape

`ask_user` accepts a small form with optional framing text:

| Field | Type | Description |
|-------|------|-------------|
| `title` | string (optional) | Short overall title for the form |
| `intro` | string (optional) | Why the agent is asking |
| `questions` | array (1–10) | Choice or text questions |

All questions are always required for a full submission. Unanswered questions produce a `needs_discussion` outcome instead of a silent partial submit. The deprecated fields `allowPartialSubmit`, `required`, `initial`, and `allowOther` are rejected with a validation error.

## Questions

Each question has a `type`, `id`, `header`, and `prompt`. Two question types are supported:

### `choice` — fixed options

| Field | Type | Description |
|-------|------|-------------|
| `options` | array (2–12) | Allowed answers with `value`, `label`, and optional `description`/`preview` |
| `multi` | boolean (default: `false`) | Allow selecting multiple options |
| `recommendation` | string \| string[] | Recommended option value(s). Single-select: a string (default: first option). Multi-select: an array (default: none). |

Model yes/no questions as a `choice` with `{ value: "yes", label: "Yes" }` and `{ value: "no", label: "No" }`.

### `text` — freeform input

| Field | Type | Description |
|-------|------|-------------|
| `recommendation` | string (optional) | Suggested text prefilled in the editor |
| `placeholder` | string (optional) | Placeholder shown before the user types |

## Result

A completed form returns a result with `details.outcome` set to one of:

| Outcome | Meaning |
|---------|---------|
| `submitted` | Full submit, every question was answered |
| `needs_discussion` | One or more questions were left unanswered |

`details.responses` is an ordered array matching the original question order. Each response has:
- `questionId` — matching the original question ID
- `questionComment` (optional) — user comment on this specific question
- `answer` — structured response with `kind`, `answered`, and type-specific data

**Choice responses** include only touched options (selected options and/or options with comments):
```ts
{
  answer: {
    kind: "choice",
    answered: boolean,
    options: Array<{
      value: string;
      label: string;
      selected: boolean;
      comment?: string;
    }>;
  }
}
```

**Text responses**:
```ts
{
  answer: {
    kind: "text",
    answered: boolean,
    value?: string;
  }
}
```

`details.comment` is the form-level user comment when one was entered.

The tool result `details` also includes `title`, `intro`, and the normalized `questions` array (same order as the original request, with internal fields such as `multi` and `recommendedIndexes`). Consumers should rely on `responses` for the user's answers; `questions` is kept for rendering and is not part of the model-facing answer contract.

Internal cancel and abort results are not persisted as user responses — they cause the agent turn to be aborted and return an error-style result to the model.

## Behavior

- Requires pi in interactive (TUI) mode with custom form support — no degraded fallback
- Only one `ask_user` form may be active at a time; calling `ask_user` while another form is in flight returns an error
- Cancellation or abort stops the current agent turn
- Completed forms are summarized in the session tree
- In pi's normal chat history, completed `ask_user` results can be expanded into a read-only review with `Ctrl+O`; this does not reopen the live form and is separate from `/tree`
- Do not use `ask_user` for open-ended interviews or repo facts the agent can discover on its own

## Tool guidance

The tool registers the following prompt guidance that the model sees:

- Use ask_user only for blocking user input, not open-ended interviews or repo facts.
- Use ask_user with 1-10 related questions; prefer one when possible.
- Use ask_user `choice` for fixed options and ask_user `text` for freeform input; yes/no should be a `choice`.
- Keep one ask_user form active at a time.
- Use `recommendation` to suggest default choices or prefilled text.
- Comments are user UI affordances — do not reference removed fields like `required`, `initial`, `allowOther`, or `allowPartialSubmit`.

## UI controls

### Choice questions

- `↑↓` — move between options
- `Space` — select the focused option (single-select) or toggle (multi-select)
- `Enter` — on single-select, selects the focused option and advances; on multi-select, accepts current selections and advances (no toggling)
- `Tab` / `→` — go to the next question; from the last question, go to review
- `Shift+Tab` / `←` — go to the previous question
- `n` — edit a comment for the focused choice option (whether selected or not)
- `c` — edit a comment for the current question
- `u` — mark the current question unanswered and show an unanswered status line (preserves comments)
- `Esc` — cancel the whole form

The recommended/preselected option is labeled `[recommended]`.

On wide terminals, option previews render side-by-side with the option list. On narrow terminals, previews stack below.

### Text questions

- The editor is visible immediately with any recommendation prefilled
- `Enter` — submit the current text and advance
- `Tab` — go to the next question
- `Alt+C` — edit a comment for the current question
- `Alt+U` — mark the current question unanswered
- Plain printable characters, including `c` and `u`, are inserted into the editor
- `Esc` — cancel the whole form

### Review screen

- `↑↓` — move between questions and the Submit row
- `Enter` — on a question, open that question for editing; on the Submit row, submit the form
- `←` / `Shift+Tab` — return to the last question
- `c` — edit the form-level comment
- `Esc` — cancel the whole form

The review screen shows every question with an answered/unanswered marker and any option comments before submission. The final question always moves to review rather than submitting immediately, and the Submit row is focused by default so the form can be submitted with a single `Enter`. When a question is opened from review, saving/advancing that question returns to review instead of walking through later questions.

### Comment editors

Question, option, and form-level comment editors are opened with `c`, `n`, or `Alt+C` depending on the current screen.

- `Enter` — save the comment and return to the form or review screen
- `Esc` — discard unsaved comment edits and return to the form or review screen without cancelling the whole interaction

## Example

```json
{
  "title": "Formatter decision",
  "intro": "I need one explicit choice before I update the repo config.",
  "questions": [
    {
      "type": "choice",
      "id": "formatter",
      "header": "Formatter",
      "prompt": "Which formatter should I configure?",
      "options": [
        { "value": "biome", "label": "Biome" },
        { "value": "prettier", "label": "Prettier" }
      ],
      "recommendation": "biome"
    },
    {
      "type": "text",
      "id": "reason",
      "header": "Reason",
      "prompt": "Anything I should optimize for?",
      "placeholder": "optional"
    }
  ]
}
```

## Source layout

- `src/extension.ts` — pi extension entrypoint
- `src/api.ts` — reusable public surface
- `src/index.ts` — package barrel
- `src/ask-user.ts` — tool registration and execution boundary
- `src/schema.ts` — tool-call parameter schema (TypeBox)
- `src/types.ts` — internal normalized types and response shapes
- `src/normalize.ts` — validation and lowering into internal types
- `src/tool/guidance.ts` — prompt guidance and tool description
- `src/session/controller.ts` — headless decision-form state machine with comment/responses
- `src/session/lock.ts` — session-scoped concurrency lock
- `src/ui/choose-renderer.ts` — custom-form capability gate
- `src/ui/form.ts` — form runner that creates the custom interaction session
- `src/ui/form-component.ts` — keyboard orchestration for question screens, comment editors, and review
- `src/ui/form-view.ts` — choice row helpers
- `src/ui/form-render.ts` — main form rendering for choices, text, comments, and layout frame
- `src/ui/form-review-render.ts` — review-screen summary cards
- `src/ui/form-render-primitives.ts` — shared rendering primitives for boxes, wrapping, prompts, and padding
- `src/ui/types.ts` — shared UI runner types
- `src/render/result.ts` — tool result shaping
- `src/render/transcript.ts` — transcript rendering
- `src/render/tree-summary.ts` — session-tree summary labels
