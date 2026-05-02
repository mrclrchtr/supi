# CLAUDE.md

This file provides guidance to Claude Code when working in `packages/supi-skill-shortcut/`.

## Scope

`@mrclrchtr/supi-skill-shortcut` lets users type `$skill-name` as shorthand for `/skill:skill-name`.

Entrypoint: `skill-shortcut.ts`

## Architecture

The extension uses the stacked autocomplete provider API (`ctx.ui.addAutocompleteProvider`) introduced in pi 0.69.0:
- registers a provider that returns skill suggestions when the cursor prefix starts with `$`
- delegates back to the current provider outside `$` tokens so built-in completion continues normally
- the `input` event handler transforms `$skill-name` → `/skill:skill-name` before agent processing

## Behavior gotchas

- Installed skill names are snapshotted at `session_start` via `pi.getCommands()`; after adding or removing skills, use `/reload` or start a new session before testing expansion behavior.
- Outside `$...` tokens, autocomplete must delegate back to the current provider so built-in completion and file completion continue to work normally.

## Working rules

- If behavior changes, test both:
  - expansion inside `$...` tokens
  - normal autocomplete everywhere else

## Validation

- `pnpm exec biome check packages/supi-skill-shortcut && pnpm exec tsc --noEmit -p packages/supi-skill-shortcut/tsconfig.json`
