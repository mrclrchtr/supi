# @mrclrchtr/supi-skill-shortcut

`$skill-name` shorthand and autocomplete for pi skills.

## Install

```bash
pi install npm:@mrclrchtr/supi-skill-shortcut
```

## What it adds

This extension lets users type installed skills with a `$` prefix instead of the full `/skill:` command.

Examples:

- `$review-changes` → `/skill:review-changes`
- `$find-docs` → `/skill:find-docs`

It also adds autocomplete suggestions when typing `$`.

## Usage

Type a skill token anywhere in the prompt as a whitespace-delimited token:

```text
Use $find-docs before changing this integration.
```

Before the message is sent to the agent, matching installed skills are transformed to `/skill:<name>`.

## Behavior

- autocomplete activates for `$...` tokens
- only installed skills are expanded
- non-skill text is left unchanged

## Requirements

- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-tui`

## Source

- Entrypoint: `skill-shortcut.ts`
