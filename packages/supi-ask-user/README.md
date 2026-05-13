# @mrclrchtr/supi-ask-user

Structured `ask_user` tool and rich questionnaire overlay for the [pi coding agent](https://github.com/earendil-works/pi). Lets the agent pause and ask you focused, typed decisions — picking from lists, multi-selecting, or entering freeform text.

## Install

```bash
pi install npm:@mrclrchtr/supi-ask-user
```

For local development:

```bash
pi install ./packages/supi-ask-user
```

After editing the source, run `/reload` to pick up changes.

## What it adds

Registers the `ask_user` tool — callable by the model during an agent run. When the agent needs explicit user input to proceed, it invokes `ask_user` with a questionnaire, and the extension opens an interactive overlay.

**Question types:**

| Type | Use |
|------|-----|
| `choice` | Pick one option (default) or multiple options (`multi: true`) from a list |
| `text` | Freeform text input |

For yes/no questions, use `choice` with options `{value: "yes", label: "Yes"}` and `{value: "no", label: "No"}` — there is no separate `yesno` type.

**Key behaviors:**

- Returns an error in non-interactive or print-mode sessions (no fallback dialog).
- Only one questionnaire runs at a time — concurrent `ask_user` calls return an error.
- Cancelling or closing the overlay aborts the current agent turn.
- Completed answers appear as a readable summary entry in the `/tree` view.

## Usage

The agent decides when to call `ask_user`. You control how it's used through the system prompt guidelines the extension injects. A minimal example the agent might construct:

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

**Multi-select example:**

```json
{
  "type": "choice",
  "multi": true,
  "id": "features",
  "header": "Features",
  "prompt": "Which features to include?",
  "options": [
    { "value": "auth", "label": "Authentication" },
    { "value": "caching", "label": "Caching" },
    { "value": "logging", "label": "Logging" }
  ],
  "recommendation": ["auth", "caching"]
}
```

**Per-question features:**

- `multi` — set to `true` to enable multi-select (replaces the former `multichoice` type). Default `false`.
- `recommendation` — highlights the preferred option with a visual badge. String for single-select, array for multi-select.
- `default` — pre-selects a starting value the user can accept with a single keystroke. String for single-select, array for multi-select.
- `allowOther` — lets the user type a custom answer instead of picking from options.
- `allowDiscuss` — lets the user opt into a discussion instead of deciding immediately.
- `preview` — rich content (markdown, code, or ASCII mockups) shown alongside the option.

**Questionnaire-level controls:**

- `allowSkip` — exposes a Skip action so the user can submit partial results without answering all required questions.

## Limits

- **1–4 questions** per questionnaire. Use one decision per call; chain multiple calls when you need more questions.
- **2–12 options** per `choice` question (single or multi-select).
- **60 characters** max per question header.
- **4000 characters** max per question prompt.

## Requirements

- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-tui`
- `typebox`

## Source

Entrypoint: `src/ask-user.ts` — registers the `ask_user` tool, drives the questionnaire overlay, and manages the concurrency lock.
