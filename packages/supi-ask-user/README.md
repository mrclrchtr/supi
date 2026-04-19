# @mrclrchtr/supi-ask-user

Structured `ask_user` questionnaires and rich decision UI for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

## Install

```bash
pi install npm:@mrclrchtr/supi-ask-user
```

## What it adds

This extension registers the `ask_user` tool for focused agent-user decisions.

Supported question types:

- `choice`
- `multichoice`
- `text`
- `yesno`

Key behavior:

- supports 1-4 grouped questions per questionnaire
- supports `recommendation`, `allowOther`, and `allowDiscuss`
- supports rich option `preview` content
- uses a rich custom UI when available
- falls back to simpler select/input prompts when rich UI is unavailable
- aborts the current agent turn if the questionnaire is cancelled

This package also bundles the `supi-ask-user-guide` skill.

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
      "recommendation": "biome"
    }
  ]
}
```

## When to use it

Use `ask_user` for narrow decisions that require explicit user input, such as:

- picking between a small set of implementation options
- confirming destructive actions
- choosing priorities from a short list
- clarifying intent before risky work

Do not use it as a substitute for reading code, investigating the repo, or broad open-ended discovery.

## Requirements

- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-tui`
- `typebox`

## Source

- Entrypoint: `ask-user.ts`
- Skill resources: `resources/supi-ask-user-guide/`
