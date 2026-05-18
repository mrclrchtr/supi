# @mrclrchtr/supi-ask-user

Adds a structured `ask_user` tool to the [pi coding agent](https://github.com/earendil-works/pi). It lets the model pause and ask a small, focused questionnaire instead of guessing.

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

- `ask_user` — open an interactive questionnaire overlay during a run

Use cases it is built for:

- clarify a narrow requirement before editing code
- choose between a few implementation options
- confirm a risky or destructive action
- collect a short list of feature priorities

It is not meant for open-ended interviews or long surveys.

## Question types

`ask_user` supports two question types:

| Type | What it does |
| --- | --- |
| `choice` | Pick from a list of options; single-select by default, multi-select with `multi: true` |
| `text` | Enter freeform text |

There is no separate yes/no type. Use `choice` with `yes` and `no` options.

## Per-question features

Choice questions can include:

- `recommendation` — highlight the preferred option
- `default` — preselect a starting value
- `allowOther` — allow a custom answer instead of the listed options
- `allowDiscuss` — let the user switch into a discussion instead of choosing immediately
- `preview` — show richer content for an option, such as Markdown, code, or ASCII mockups

At the questionnaire level:

- `allowSkip` — let the user submit partial results instead of answering every required question

## Behavior and limits

- interactive UI required; non-interactive or degraded sessions return an error
- only one `ask_user` interaction can run at a time
- if the user cancels or closes the overlay, the current agent turn is aborted
- completed questionnaires are added to the session tree as a readable summary entry
- each questionnaire supports **1-4 questions**
- each `choice` question supports **2-12 options**
- question headers are limited to **60 characters**
- question prompts are limited to **4000 characters**

## Example shape

```json
{
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
      "default": "biome"
    },
    {
      "type": "text",
      "id": "reason",
      "header": "Reason",
      "prompt": "Why this formatter?",
      "default": "Faster linting"
    }
  ]
}
```

## Requirements

- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-tui`
- `typebox`

## Source

- `src/ask-user.ts` — tool registration and run flow
- `src/schema.ts` — model-facing parameter schema
- `src/normalize.ts` — validation and limits
