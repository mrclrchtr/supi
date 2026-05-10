# @mrclrchtr/supi-ask-user

Structured `ask_user` questionnaires and rich decision UI for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

## Install

```bash
pi install npm:@mrclrchtr/supi-ask-user
```

## What it adds

This extension registers the `ask_user` tool for focused agent-user decisions.

Supported question types:

- `choice` — Pick exactly one from known options
- `multichoice` — Pick multiple from a short list
- `text` — Freeform text input
- `yesno` — Binary go/no-go

Key features:

- rich questionnaire UI with 1–4 grouped questions
- recommendation highlighting for the preferred option
- `default` pre-selection for text and structured questions
- `allowOther` and `allowDiscuss` for flexibility
- rich option `preview` content
- automatic fallback to simpler prompts when the rich UI is unavailable
- abort on cancel to stop the current agent turn

## Example

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

- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-tui`
- `typebox`

## Source

- Entrypoint: `ask-user.ts`
