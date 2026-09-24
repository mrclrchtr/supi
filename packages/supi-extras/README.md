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

![Stash picker overlay](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-extras-stash.png)

## Commands

- `/exit` — exit pi
- `/e` — alias for `/exit`
- `/clear` — start a new session (alias for `/new`)
- `/clone-session <session-id>` — clone a session into the current worktree and switch to it; autocomplete searches IDs and session names
- `/supi-stash` — browse, restore, copy, delete, or clear saved prompt drafts
- `/supi-capabilities` — choose extension tools and model-visible skills for this session

## Session capabilities

`/supi-capabilities` opens a searchable selector. Use it to change extension tool and skill visibility for the current session.

- The selector lists only extension tools that were active at startup. It does not list PI built-in tools or tools supplied by integrations.
- Tool and skill overrides are stored in the session. Resume restores them. Fork and `/clone-session` copy them. `/new` starts without overrides.
- Tree navigation keeps explicit capability tool choices and does not change other tool choices.
- Tool changes affect later requests. They do not stop a tool call that is already running.
- Saved tool restrictions also apply if a tool becomes available later. Use **Reset Tools** to clear them.
- Skill changes affect the model skill catalog only. Explicit `/skill:name` commands and `$name` shortcuts stay available.
- Use **Reset Tools**, **Reset Skills**, or **Reset All** to remove overrides.
- The footer shows a count while overrides are active.

Install [`@mrclrchtr/supi-skills`](https://github.com/mrclrchtr/supi/tree/main/packages/supi-skills) to manage skills. Tool controls work without that package.

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

If the stash file cannot be read or written, drafts are kept in memory only and can be lost when pi closes.

## Passive behavior

### Tab-title spinner

While the agent is working, the package animates a spinner in the terminal tab title. When the turn finishes, it shows a done marker. The spinner pauses while a question waits for your answer.

### Footer replacement

The package replaces pi's default footer. It shows the model and thinking level with theme colors.

### Headless git safety

The package sets:

- `GIT_EDITOR=true`
- `GIT_SEQUENCE_EDITOR=true`

That prevents git subprocesses from hanging while waiting for an interactive editor.
