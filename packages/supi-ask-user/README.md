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

![ask_user overlay](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-ask-user.png)

![ask_user choice with preview](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-ask-user-2.png)

## What you get

After install, pi gets one new tool:

- **`ask_user`** — open a blocking decision form during a run

The tool presents a structured questionnaire in the TUI overlay and blocks the agent turn until the user responds. It is designed for focused decisions, **not** long surveys or open-ended discovery.

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
| `allowPartialSubmit` | boolean (optional) | Let the user submit partial progress |

## Questions

Each question has a `type`, `id`, `header`, and `prompt`. Two question types are supported:

### `choice` — fixed options

| Field | Type | Description |
|-------|------|-------------|
| `options` | array (2–12) | Allowed answers with `value`, `label`, and optional `description`/`preview` |
| `required` | boolean (default: `true`) | Whether this question must be answered |
| `multi` | boolean (default: `false`) | Allow selecting multiple options |
| `allowOther` | boolean | Allow a freeform answer instead of listed options. Single-select only. |
| `recommendation` | string \| string[] | Recommended option value(s) |
| `initial` | string \| string[] | Initially selected option value(s) |

Model yes/no questions as a `choice` with `{ value: "yes", label: "Yes" }` and `{ value: "no", label: "No" }`.

### `text` — freeform input

| Field | Type | Description |
|-------|------|-------------|
| `required` | boolean (default: `true`) | Whether this question must be answered |
| `initial` | string | Initial value shown in the editor |
| `placeholder` | string | Placeholder shown before the user types |

## Result

A completed form returns a result with `details.status` set to one of:

| Status | Meaning |
|--------|---------|
| `submitted` | Full submit, all required questions answered |
| `partial` | Partial submit with some required questions unanswered |
| `discuss` | User wants to continue the conversation instead of deciding |
| `cancelled` | User explicitly cancelled (aborts the current agent turn) |
| `aborted` | The interaction was aborted externally (aborts the current agent turn) |

`details.answersById` maps question IDs to their answers. Each answer has a `kind` and type-specific data:

- `{ kind: "choice", selections: [{ value, label, note? }] }` — single or multi-select choice, with optional per-option user notes
- `{ kind: "custom", value: "..." }` — freeform `allowOther` answer
- `{ kind: "text", value: "..." }` — freeform text answer

`details.missingQuestionIds` lists any required questions that were left unanswered on a partial submit.

## Behavior

- Requires pi in interactive (TUI) mode with custom overlay support — no degraded fallback
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
- Keep one ask_user form active at a time; use `allowOther` only for single-select choice and `allowPartialSubmit` only when actionable.

## UI controls

### Choice questions

- `↑↓` — move between options
- `Space` — select the focused option (single-select) or toggle (multi-select)
- `Enter` — submit the current answer
- `n` — edit a note for the focused choice option
- `←` — go back to the previous question
- `Esc` — cancel the whole form (or close the note editor if one is open)

On wide terminals, option previews render side-by-side with the option list. On narrow terminals, previews stack below.

Notes are available only for real `choice` options. They do not apply to `text` questions, `Other…` freeform answers, or other exceptional action rows. Saving a non-empty note selects the option if needed; clearing a note leaves the current selection alone; deselecting a multi-select option removes its note with the selection.

Only exceptional action rows are visible:

- `Other…` — when `allowOther` is enabled
- `Discuss instead…` — always available
- `Submit partial answers` — when `allowPartialSubmit` is enabled
- `Skip question` — for optional questions

Back and cancel are keyboard-only (`←`, `Esc`) — no visible rows.

### Text questions

- The editor is visible immediately (no separate entry row)
- `Enter` — submit the current text
- `↓` — move from the editor into visible exceptional action rows
- `↑` — from the first action row, return focus to the editor
- `Esc` — cancel the whole form

Exceptional action rows (`Discuss instead…`, `Submit partial answers`) may appear below the editor when those paths are enabled.

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
      "recommendation": "biome",
      "initial": "biome"
    },
    {
      "type": "text",
      "id": "reason",
      "header": "Reason",
      "prompt": "Anything I should optimize for?",
      "required": false,
      "placeholder": "optional"
    }
  ],
  "allowPartialSubmit": true
}
```

## Source layout

- `src/extension.ts` — pi extension entrypoint
- `src/api.ts` — reusable public surface
- `src/index.ts` — package barrel
- `src/ask-user.ts` — tool registration and execution boundary
- `src/schema.ts` — tool-call parameter schema (TypeBox)
- `src/types.ts` — internal normalized types and answer shapes
- `src/normalize.ts` — validation and lowering into internal types
- `src/tool/guidance.ts` — prompt guidance and tool description
- `src/session/controller.ts` — headless decision-form state machine
- `src/session/lock.ts` — session-scoped concurrency lock
- `src/ui/choose-renderer.ts` — custom-overlay capability gate
- `src/ui/overlay.ts` — overlay runner that creates the custom interaction session
- `src/ui/overlay-component.ts` — rich custom interaction state and input orchestration
- `src/ui/overlay-view.ts` — choice/action row modeling and split-layout helpers
- `src/ui/overlay-render.ts` — rich overlay rendering built on `Markdown`, `Editor`, and `SelectList`
- `src/ui/overlay-actions.ts` — exceptional-action list wiring for text questions
- `src/ui/types.ts` — shared UI runner types
- `src/render/result.ts` — tool result shaping
- `src/render/transcript.ts` — transcript rendering
- `src/render/tree-summary.ts` — session-tree summary labels
