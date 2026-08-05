<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-extras">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-extras/assets/social-preview.png" alt="SuPi Extras" width="100%">
  </a>
</div>

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
- `/clone-session <session-id>` — clone a session into the current worktree and switch to it; autocomplete searches IDs and session names
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

### User path references

Treat `@<path>` in a user message as the path `<path>`: relative paths use PI's current working directory; absolute paths stay absolute. This fixes [pi#6487](https://github.com/earendil-works/pi/issues/6487).

### Tab-title spinner

While the agent is working, the package animates a spinner in the terminal tab title. When the turn finishes, it shows a done marker. If `ask_user` is active, the spinner pauses so the waiting-for-input title is not overwritten.

### Footer replacement

The package replaces pi's default footer. The model name is colored by provider using theme tokens; thinking level coloring delegates to Pi's theme.

### Headless git safety

The package sets:

- `GIT_EDITOR=true`
- `GIT_SEQUENCE_EDITOR=true`

That prevents git subprocesses from hanging while waiting for an interactive editor.

## Source

- `src/aliases.ts` — command aliases
- `src/clone-session.ts` — cross-worktree session cloning by ID
- `src/prompt-stash.ts` — prompt stash shortcuts, persistence, and overlay
- `src/skill-shortcut.ts` — `$skill-name` expansion and autocomplete
- `src/tab-spinner.ts` — terminal tab-title spinner
- `src/copy-prompt.ts` and `src/clipboard.ts` — copy-to-clipboard shortcut and helper
- `src/supi-footer.ts` — footer replacement
- `src/supi-footer-helpers.ts` — pure helpers
- `src/git-editor.ts` — git editor environment guard
