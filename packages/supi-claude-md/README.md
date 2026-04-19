# @mrclrchtr/supi-claude-md

Automatic `CLAUDE.md` / `AGENTS.md` context management for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

## Install

```bash
pi install npm:@mrclrchtr/supi-claude-md
```

## What it adds

This extension combines two related behaviors:

1. **Subdirectory discovery** — inject context files from subdirectories when the agent touches files there.
2. **Root refresh** — periodically re-inject root or ancestor context files that pi already loaded natively.

It also registers an interactive settings command:

```text
/supi-claude-md
```

This package bundles the `supi-claude-md-guide` skill.

## Configuration

Configuration uses the shared SuPi config system.

Config file locations:

- global: `~/.pi/agent/supi/config.json`
- project: `.pi/supi/config.json`

Use the `claude-md` section:

```json
{
  "claude-md": {
    "rereadInterval": 3,
    "subdirs": true,
    "fileNames": ["CLAUDE.md", "AGENTS.md"]
  }
}
```

Options:

- `rereadInterval` — turns between refreshes; `0` disables refresh
- `subdirs` — enable or disable subdirectory discovery
- `fileNames` — ordered list of context filenames to search for

## Behavior notes

- pi still loads root context files natively; this extension augments that behavior.
- subdirectory context is injected from path-aware tool activity such as reads, writes, edits, and LSP operations.
- the settings UI opens directly in the pi interface rather than as a separate modal dialog.

## Requirements

- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-tui`
- `@mrclrchtr/supi-core`

## Source

- Entrypoint: `index.ts`
- Skill resources: `resources/supi-claude-md-guide/`
