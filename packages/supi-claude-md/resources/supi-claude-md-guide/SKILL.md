---
name: supi-claude-md-guide
description: How supi-claude-md context injection works — subdirectory discovery, settings UI, and configuration.
---

# Context Injection Guide

## How it works

supi-claude-md gives the agent project context beyond what pi loads natively:

1. **Subdirectory discovery** — when the agent accesses files in a subdirectory, CLAUDE.md/AGENTS.md files from that directory (and its ancestors up to cwd) are injected into the tool result.
2. **Native root context** — root/ancestor context files that pi loaded natively are part of the system prompt on every LLM call. SuPi does not re-inject them.

## Subdirectory discovery

When the agent touches a path-aware tool target such as `packages/my-lib/src/foo.ts`, supi-claude-md checks for context files in:
- `packages/my-lib/`
- `packages/`

This can be triggered by reads, writes, edits, and other path-aware tooling such as LSP operations. It injects any CLAUDE.md or AGENTS.md found there directly into the tool result. The agent sees this context automatically — no action needed.

Each directory is injected at most once per session (by default). After the configured `rereadInterval` turns, the content is re-read in case it changed.

Re-injection of already-seen directories is skipped when context usage is at or above `contextThreshold`. First-time directory discovery is still injected even under context pressure.

## Native root context

Pi loads root and ancestor instruction files (`AGENTS.md`, `CLAUDE.md`) into the system prompt automatically. Because the system prompt is sent on every LLM call, that context is always present.

SuPi **does not** re-inject these files. If you edit a root instruction file mid-session, use pi's `/reload` command or restart the session so pi rebuilds the native system prompt.

## Settings

Run `/supi-settings` to open the interactive settings UI. It opens directly in the pi interface, replaces the editor area, and shows the current effective configuration with keyboard navigation:

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate between settings |
| `Enter` | Edit / toggle the selected setting |
| `Tab` | Switch between Project and Global scope |
| `Esc` | Close the settings UI |

Changes are persisted immediately to the selected scope's config file.

Claude-MD currently contributes these setting types inside the shared UI:

- `Subdirectory Discovery` — on/off toggle
- `Subdirectory Re-read Interval` — text input; enter a number of turns or `0` to disable subdirectory re-reads
- `Context Threshold` — choose from common percentage values
- `Context File Names` — comma-separated text input; clearing it restores the default file list

## Configuration

Config lives in `.pi/supi/config.json` under the `claude-md` section:

```json
{
  "claude-md": {
    "subdirs": true,
    "fileNames": ["CLAUDE.md", "AGENTS.md"],
    "rereadInterval": 3,
    "contextThreshold": 80
  }
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `subdirs` | `true` | Enable subdirectory context injection |
| `fileNames` | `["CLAUDE.md", "AGENTS.md"]` | Filenames to look for in each directory |
| `rereadInterval` | `3` | Re-read previously injected subdirectory context every N turns (0 = off) |
| `contextThreshold` | `80` | Skip subdirectory re-injection when context usage is at or above this percent (100 = off). First-time discovery is always allowed. |

## Tips

- Put project-specific guidelines in subdirectory CLAUDE.md files so the agent gets them only when working in that area.
- Use the settings UI (`/supi-settings`) to adjust `rereadInterval` or `contextThreshold` mid-session — changes take effect on the next turn.
- Context is injected as XML `<extension-context>` blocks with a `source="supi-claude-md"` attribute.
