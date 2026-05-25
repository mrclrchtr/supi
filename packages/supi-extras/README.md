![SuPi](assets/logo.png)

# @mrclrchtr/supi-extras

Adds a bundle of small quality-of-life features to the [pi coding agent](https://github.com/earendil-works/pi).

## Install

```bash
pi install npm:@mrclrchtr/supi-extras
```

For local development:

```bash
pi install ./packages/supi-extras
```

![Stash picker overlay](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-extras-stash.png)

## What you get

This package mixes a few commands and shortcuts with a few always-on UI tweaks.

## Commands

- `/exit` — exit pi
- `/e` — alias for `/exit`
- `/clear` — start a new session (alias for `/new`)
- `/supi-stash` — browse, restore, copy, delete, or clear saved prompt drafts

## Shortcuts

- `Alt+S` — stash the current editor text
- `Alt+C` — copy the current editor text to the system clipboard
- `$skill-name` — input shorthand that expands to `/skill:skill-name`

The `$skill-name` helper also adds skill-only autocomplete while the cursor is inside a `$...` token.

## Prompt stash

Prompt stash stores drafts in `~/.pi/agent/supi/prompt-stash.json` so they survive restarts.

`/supi-stash` opens an overlay with these actions:

- `Enter` — restore the selected draft into the editor
- `c` — copy the selected draft to the clipboard
- `d` — delete the selected draft
- `D` — clear all drafts
- `Esc` — close the overlay

If the stash file cannot be read or written, the feature degrades to in-memory use instead of breaking the extension.

## Passive behavior

### Tab-title spinner

While the agent is working, the package animates a spinner in the terminal tab title. When the turn finishes, it shows a done marker. If `ask_user` is active, the spinner pauses so the waiting-for-input title is not overwritten.

### Footer model and effort colors

The footer keeps pi's existing information but recolors the active model and reasoning level using theme tokens.

### Headless git safety

The package sets:

- `GIT_EDITOR=true`
- `GIT_SEQUENCE_EDITOR=true`

That prevents git subprocesses from hanging while waiting for an interactive editor.

## Source

- `src/aliases.ts` — command aliases
- `src/prompt-stash.ts` — prompt stash shortcuts, persistence, and overlay
- `src/skill-shortcut.ts` — `$skill-name` expansion and autocomplete
- `src/tab-spinner.ts` — terminal tab-title spinner
- `src/copy-prompt.ts` and `src/clipboard.ts` — copy-to-clipboard shortcut and helper
- `src/model-effort-colors.ts` — footer recoloring
- `src/git-editor.ts` — git editor environment guard
