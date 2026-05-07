# @mrclrchtr/supi-extras

Small workflow utilities for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

## Install

```bash
pi install npm:@mrclrchtr/supi-extras
```

## What it adds

`@mrclrchtr/supi-extras` bundles several lightweight extensions:

- **tab spinner** — updates the terminal tab title while agent work is running
- **copy prompt** — `Alt+C` (Option+C) to copy the current editor text to the clipboard
- **prompt stash** — `Alt+S` to stash editor text, `/supi-stash` to browse and restore saved drafts
- **git editor guard** — sets `GIT_EDITOR=true` so git never blocks on an interactive editor
- **command aliases** — `/exit`, `/e`, and `/clear`
- **skill shortcut** — expands `$skill-name` into `/skill:skill-name`

## Prompt stash behavior

Prompt stashes are persisted to:

```text
~/.pi/agent/supi/prompt-stash.json
```

The `/supi-stash` overlay supports restore, copy, delete, and clear-all actions.

## Clipboard

Both `Alt+C` and the stash overlay's copy action use the shared clipboard utility
(`clipboard.ts`) which pipes text through the platform clipboard tool:

| Platform | Tool |
|----------|------|
| macOS    | `pbcopy` |
| Linux    | `wl-copy` (Wayland) / `xclip` (X11) |
| Windows  | `powershell Set-Clipboard` |

## Architecture

```text
src/
├── index.ts          package entrypoint
├── clipboard.ts      shared clipboard utility (pbcopy/wl-copy/xclip)
├── copy-prompt.ts    Alt+C to copy editor text to clipboard
├── tab-spinner.ts    tab-title spinner + supi:working:* listeners
├── prompt-stash.ts   stash shortcuts, persistence, and overlay picker
├── git-editor.ts     git editor environment guard
├── aliases.ts        lightweight command aliases
└── skill-shortcut.ts $skill-name expansion and autocomplete hook
```

## Requirements

- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-tui`

## Development

```bash
pnpm vitest run packages/supi-extras/
pnpm exec tsc --noEmit -p packages/supi-extras/tsconfig.json
pnpm exec biome check packages/supi-extras/
```

## License

MIT
