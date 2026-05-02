# @mrclrchtr/supi-claude-md

Automatic `CLAUDE.md` / `AGENTS.md` context management for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

## Install

```bash
pi install npm:@mrclrchtr/supi-claude-md
```

## What it adds

This extension adds **subdirectory discovery** — injecting `CLAUDE.md` / `AGENTS.md` from subdirectories when the agent touches files there.

Pi loads root and ancestor instruction files natively into the system prompt on every turn. To update root instruction files mid-session, use pi's `/reload` command or restart the session.

Settings are managed through the shared SuPi settings command:

```text
/supi-settings
```

Inside `/supi-settings`, Claude-MD contributes:

- `Subdirectory Discovery` — on/off toggle
- `Subdirectory Re-read Interval` — text input; enter a number of turns or `0` to disable subdirectory re-reads
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

- `rereadInterval` — turns between re-reading previously injected subdirectory context; `0` disables subdirectory re-reads (first-time discovery is unaffected)
- `contextThreshold` — skip subdirectory re-injection when context usage is at or above this percent; `100` disables context gating; first-time discovery is always allowed
- `subdirs` — enable or disable subdirectory discovery
- `fileNames` — ordered list of context filenames to search for

## Behavior notes

- root and ancestor instruction files are loaded natively by pi's system prompt; this extension does not re-inject them
- subdirectory context is injected from path-aware tool activity such as reads, writes, edits, LSP operations, and Tree-sitter operations
- the settings UI opens directly in the pi interface rather than as a separate modal dialog

## Requirements

- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-tui`
- `@mrclrchtr/supi-core`

## Source

- Entrypoint: `index.ts`
- Skill resources: `resources/supi-claude-md-guide/`
