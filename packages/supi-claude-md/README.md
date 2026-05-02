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

Settings are managed through the shared SuPi settings command:

```text
/supi-settings
```

Inside `/supi-settings`, Claude-MD contributes:

- `Subdirectory Discovery` — on/off toggle
- `Context Refresh Interval` — text input; enter a number of turns or `0` to disable refresh
- `Context Threshold` — common percentage values from `0` to `100`
- `Context File Names` — comma-separated text input; empty input restores the default filenames

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
    "contextThreshold": 80,
    "subdirs": true,
    "fileNames": ["CLAUDE.md", "AGENTS.md"]
  }
}
```

Options:

- `rereadInterval` — turns between refreshes; `0` disables refresh
- `contextThreshold` — skip refresh/re-injection when context usage is at or above this percent; `100` disables context gating
- `subdirs` — enable or disable subdirectory discovery
- `fileNames` — ordered list of context filenames to search for

## Behavior notes

- pi still loads root context files natively; this extension augments that behavior.
- subdirectory context is injected from path-aware tool activity such as reads, writes, edits, LSP operations, and Tree-sitter operations.
- the settings UI opens directly in the pi interface rather than as a separate modal dialog.

## Requirements

- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-tui`
- `@mrclrchtr/supi-core`

## Source

- Entrypoint: `index.ts`
- Skill resources: `resources/supi-claude-md-guide/`
