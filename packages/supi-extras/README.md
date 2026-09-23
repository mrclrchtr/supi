<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-extras">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-extras/assets/social-preview.png" alt="SuPi Extras" width="100%">
  </a>
</div>

# @mrclrchtr/supi-extras

[![GitHub stars](https://img.shields.io/github/stars/mrclrchtr/supi)](https://github.com/mrclrchtr/supi/stargazers) [![npm downloads](https://img.shields.io/npm/dm/@mrclrchtr/supi-extras)](https://www.npmjs.com/package/@mrclrchtr/supi-extras)

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

This package adds commands, shortcuts, and UI changes. Persistent skill controls and `$skill-name` shortcuts live in [`@mrclrchtr/supi-skills`](https://github.com/mrclrchtr/supi/tree/main/packages/supi-skills). That package supplies the skill list for session visibility controls.

## Commands

- `/exit` — exit pi
- `/e` — alias for `/exit`
- `/clear` — start a new session (alias for `/new`)
- `/clone-session <session-id>` — clone a session into the current worktree and switch to it; autocomplete searches IDs and session names
- `/supi-stash` — browse, restore, copy, delete, or clear saved prompt drafts
- `/supi-capabilities` — choose extension tools and model-visible skills for this session

## Session capabilities

`/supi-capabilities` opens a searchable selector. Use it to change extension tool and skill visibility for the current session.

- The selector lists extension tools that PI allowed at startup. It does not list PI built-in or SDK tools.
- The selector never enables a tool that was inactive at startup.
- Tool and skill overrides are stored in the session. Resume restores them. Fork and `/clone-session` copy them. `/new` starts without overrides.
- Tree navigation keeps explicit capability tool choices and does not change other tool choices.
- Tool changes affect later requests. They do not stop a tool call that is already running.
- PI has no event that marks the end of dynamic tool registration. SuPi cannot know when to remove a missing tool name. If a saved tool restriction names a tool that is not registered yet, SuPi keeps the restriction and applies it if the tool appears later. Use **Reset Tools** to clear it.
- Skill changes affect the model skill catalog only. Explicit `/skill:name` commands and `$name` shortcuts stay available.
- Use **Reset Tools**, **Reset Skills**, or **Reset All** to remove overrides.
- The footer shows a themed count while overrides are active.

Install `@mrclrchtr/supi-skills` to manage skills. Tool controls work without that package.

## Shortcuts

- `Alt+S` — stash the current editor text
- `Alt+C` — copy the current editor text to the system clipboard

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
- `src/tab-spinner.ts` — terminal tab-title spinner
- `src/copy-prompt.ts` and `src/clipboard.ts` — copy-to-clipboard shortcut and helper
- `src/session-capabilities.ts`, `src/session-capabilities-state.ts`, `src/session-capabilities-tools.ts`, and `src/session-capabilities-ui.ts` — session tool and skill controls
- `src/supi-footer.ts` — footer replacement
- `src/supi-footer-helpers.ts` — pure helpers
- `src/git-editor.ts` — git editor environment guard
