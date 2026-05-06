# @mrclrchtr/supi-claude-md

Automatic `CLAUDE.md` / `AGENTS.md` context management for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

## Install

```bash
pi install npm:@mrclrchtr/supi-claude-md
```

## What it adds

This extension adds **subdirectory context discovery** — injecting `CLAUDE.md` / `AGENTS.md` from subdirectories when the agent touches files there.

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

This package bundles two skills:

- `claude-md-improver` — audit CLAUDE.md files, evaluate quality, and propose targeted updates. SuPi-aware: flags content that duplicates what `supi-code-intelligence` (workspace module graph) and `supi-claude-md` (subdirectory injection) already auto-deliver
- `claude-md-revision` — capture session learnings into CLAUDE.md with user approval

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

## Requirements

- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-tui`
- `@mrclrchtr/supi-core`

## Source

- Entrypoint: `src/claude-md.ts`
- Skills: `skills/claude-md-improver/`
- Skills: `skills/claude-md-improver/`, `skills/claude-md-revision/`
