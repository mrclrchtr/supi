# @mrclrchtr/supi-ask-user

Adds a redesigned `ask_user` tool to the [pi coding agent](https://github.com/earendil-works/pi).
It lets the model pause and request a small decision form when explicit human input is required.

## Install

```bash
pi install npm:@mrclrchtr/supi-ask-user
```

For local development:

```bash
pi install ./packages/supi-ask-user
```

After editing the source, run `/reload`.

## What you get

After install, pi gets one new tool:

- `ask_user` — open a blocking decision form during a run

Use cases:

- clarify a narrow implementation choice
- confirm a risky or destructive action
- ask for a preference the repo cannot answer
- gather one short cluster of related decisions before proceeding

It is **not** meant for long surveys or open-ended discovery.

## Request shape

`ask_user` accepts a small form with optional framing text:

- `title` — short overall title
- `intro` — why the agent is asking
- `questions` — 1-4 related questions
- `allowPartialSubmit` — let the user submit partial progress
- `allowDiscuss` — let the user switch back into discussion instead of giving a final decision

## Question types

### `choice`

Use for fixed options.

Supported fields:

- `options`
- `required`
- `multi`
- `allowOther` — single-select only
- `recommendation`
- `initial`
- option `description`
- option `preview`

### `text`

Use for freeform input.

Supported fields:

- `required`
- `initial`
- `placeholder`

## Result statuses

A completed form returns one of these statuses in `details.status`:

- `submitted` — full submit
- `partial` — partial submit with missing required answers
- `discuss` — user wants to continue the conversation instead of deciding
- `cancelled` — user explicitly cancelled
- `aborted` — the interaction was aborted externally

`details.answersById` contains structured answers keyed by question id.

## Behavior

- interactive UI with custom overlay support required
- `ask_user` does not provide a degraded dialog fallback
- only one `ask_user` interaction may be active at a time
- cancellation or abort stops the current agent turn
- completed forms are summarized in the session tree

## Rich overlay controls

`ask_user` requires the rich overlay renderer. The current interaction model is:

### Choice questions

- `↑↓` move between rows
- `Space` selects the focused option in single-select mode
- `Space` toggles the focused option in multi-select mode
- `Enter` submits the current choice answer
- `←` goes back to the previous question
- `Esc` cancels the whole form

On wide terminals, choice previews render side-by-side with the option list. On narrow terminals, previews stack below.

Visible rows are kept for exceptional paths only:

- `Other…`
- `Discuss instead…`
- `Submit partial answers`
- `Skip question` for optional questions

There is no visible Back row or Cancel row in the overlay.

### Text questions

- the text editor is visible immediately
- there is no separate `Enter response…` row
- `Enter` submits the current text answer
- `↓` moves from the editor into any visible exceptional action rows
- `↑` from the first action row returns focus to the editor
- `Esc` cancels the whole form

Text questions may still show exceptional action rows such as `Discuss instead…` or `Submit partial answers` below the editor when those paths are enabled.

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
  "allowDiscuss": true
}
```

## Source layout

- `src/ask-user.ts` — tool registration and execution boundary
- `src/schema.ts` — tool-call schema
- `src/normalize.ts` — validation and lowering into internal types
- `src/session/controller.ts` — headless decision-form state
- `src/ui/choose-renderer.ts` — custom-overlay capability gate
- `src/ui/overlay.ts` — rich custom interaction orchestration
- `src/ui/overlay-view.ts` — choice/action row modeling and split-layout helpers
- `src/ui/overlay-render.ts` — rich overlay rendering built on `Markdown`, `Editor`, and `SelectList`
- `src/ui/overlay-actions.ts` — exceptional-action list wiring for text questions
- `src/ui/types.ts` — shared UI runner types
- `src/render/result.ts` — tool result shaping
- `src/render/transcript.ts` — transcript rendering
- `src/render/tree-summary.ts` — session-tree summary labels
