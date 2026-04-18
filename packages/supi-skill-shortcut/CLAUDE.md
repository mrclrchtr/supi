# CLAUDE.md

This file provides guidance to Claude Code when working in `packages/supi-skill-shortcut/`.

## Scope

`@mrclrchtr/supi-skill-shortcut` lets users type `$skill-name` as shorthand for `/skill:skill-name`.

Entrypoint: `skill-shortcut.ts`

## Architecture

The extension uses the stacked autocomplete provider API (`ctx.ui.addAutocompleteProvider`) introduced in pi 0.69.0:
- registers a provider that returns skill suggestions when the cursor prefix starts with `$`
- returns `null` outside `$` tokens so built-in completion continues normally
- the `input` event handler transforms `$skill-name` → `/skill:skill-name` before agent processing

## Fallback

`addAutocompleteProvider` is accessed via optional chaining (`?.`) with a local interface extension, so the extension gracefully degrades on pi versions < 0.69.0.

## Working rules

- If behavior changes, test both:
  - expansion inside `$...` tokens
  - normal autocomplete everywhere else
