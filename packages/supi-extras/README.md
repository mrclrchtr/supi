# @mrclrchtr/supi-extras

Small workflow utilities for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

## Install

```bash
pi install npm:@mrclrchtr/supi-extras
```

## What it adds

`@mrclrchtr/supi-extras` bundles several lightweight extensions:

- **tab spinner** — updates the terminal tab title while agent work is running
- **prompt stash** — `Alt+S` to stash editor text, `Ctrl+Shift+S` to copy it, `/supi-stash` to browse and restore saved drafts
- **git editor guard** — sets `GIT_EDITOR=true` so git never blocks on an interactive editor
- **command aliases** — `/exit`, `/e`, and `/clear`
- **skill shortcut** — expands `$skill-name` into `/skill:skill-name`

## Prompt stash behavior

Prompt stashes are persisted to:

```text
~/.pi/agent/supi/prompt-stash.json
```

The `/supi-stash` overlay supports restore, copy, delete, and clear-all actions.

## Architecture

```text
src/
├── index.ts          package entrypoint
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
