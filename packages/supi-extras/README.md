# @mrclrchtr/supi-extras

Small fixes for PI — the papercuts you didn't know you had, removed.

Command aliases so you type less. A prompt stash so you never lose a draft. A tab spinner so you know when the agent is working. Each one is tiny. Together they make sessions feel smoother.

## What you get

### Fewer keystrokes

`/exit`, `/e`, `/clear` — muscle-memory shortcuts. `$skill-name` expands to `/skill:skill-name` automatically. Less typing, more doing.

### Never lose a draft

`Alt+S` stashes your current prompt. `Alt+C` copies it to clipboard. `/supi-stash` opens a keyboard-driven overlay to browse, restore, or delete saved drafts. Stashes survive restarts.

### Know when the agent is working

A braille spinner in the terminal tab title while work is in progress. Glance at the tab — if it's spinning, the agent hasn't finished.

### No hung editors

Sets `GIT_EDITOR=true` so git never blocks on an interactive editor. Pi runs headless — editor invocations hang. This prevents that.

## Install

```bash
pi install npm:@mrclrchtr/supi-extras
```

## Stash overlay

`/supi-stash` opens an overlay in your terminal:

| Key | Action |
|-----|--------|
| `↑↓` | Navigate stashed drafts |
| `Enter` | Restore selected draft to editor |
| `c` | Copy to clipboard |
| `d` | Delete (list refreshes in-place) |
| `D` | Clear all stashes |
| `Esc` | Cancel |

Stashes persist to `~/.pi/agent/supi/prompt-stash.json` across restarts.
