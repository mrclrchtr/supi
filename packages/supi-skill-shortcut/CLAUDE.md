# CLAUDE.md

This file provides guidance to Claude Code when working in `packages/supi-skill-shortcut/`.

## Scope

`@mrclrchtr/supi-skill-shortcut` lets users type `$skill-name` as shorthand for `/skill:skill-name`.

Entrypoint: `skill-shortcut.ts`

## Architecture

The extension wraps pi-tui's autocomplete/editor stack:
- `SkillShortcutEditor` subclasses the editor integration
- it intercepts `$name` tokens under the cursor
- outside a `$` token, autocomplete should delegate back to the inner provider unchanged

## Critical gotchas

- This package intentionally reaches into private pi-tui internals using `as any` casts.
- Known private fields/methods touched include `autocompleteState`, `state`, and `tryTriggerAutocomplete`.
- These internals are undocumented and may break on `@mariozechner/pi-tui` upgrades; verify behavior after every pi-tui version bump.
- Keep the inline `// biome-ignore lint/suspicious/noExplicitAny: accessing private TUI internals` comments on each intentional cast.

## Working rules

- Prefer small, targeted changes here; regressions are easy because the package sits on private editor behavior.
- If behavior changes, test both:
  - expansion inside `$...` tokens
  - normal autocomplete everywhere else
