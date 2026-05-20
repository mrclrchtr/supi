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

- interactive UI required
- prefers a rich custom UI when available
- falls back to basic dialog-based interaction when custom UI is unavailable
- only one `ask_user` interaction may be active at a time
- cancellation or abort stops the current agent turn
- completed forms are summarized in the session tree

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
- `src/ui/dialog.ts` — basic dialog fallback
- `src/ui/overlay.ts` — rich custom renderer
- `src/render/result.ts` — tool result shaping
- `src/render/transcript.ts` — transcript rendering
