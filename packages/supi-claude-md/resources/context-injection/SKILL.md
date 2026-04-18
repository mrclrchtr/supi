---
name: context-injection
description: How supi-claude-md context injection works — subdirectory discovery, root refresh, manual commands, and configuration.
---

# Context Injection Guide

## How it works

supi-claude-md gives the agent project context beyond what pi loads natively:

1. **Subdirectory discovery** — when the agent accesses files in a subdirectory, CLAUDE.md/AGENTS.md files from that directory (and its ancestors up to cwd) are injected into the tool result.
2. **Root refresh** — root/ancestor context files that pi loaded natively are periodically re-read and re-injected so the agent sees fresh content.

## Subdirectory discovery

When the agent reads or edits `packages/my-lib/src/foo.ts`, supi-claude-md checks for context files in:
- `packages/my-lib/`
- `packages/`

It injects any CLAUDE.md or AGENTS.md found there directly into the tool result. The agent sees this context automatically — no action needed.

Each directory is injected at most once per session (by default). After the configured `rereadInterval` turns, the content is re-read in case it changed.

## Root refresh

Context files loaded natively by pi (like the root AGENTS.md) may go stale as the session progresses. supi-claude-md periodically re-reads and re-injects these files via a persistent message in `before_agent_start`.

Refresh timing is controlled by the `refreshInterval` config option (default: every 3 turns).

## Manual commands

Use `/supi-claude-md` with these subcommands:

| Subcommand | Description |
|------------|-------------|
| `status` | Show loaded context paths, turn count, and refresh state |
| `refresh` | Force an immediate root context refresh |
| `config` | Show current configuration |

## Configuration

Config lives in `.pi/supi/config.json` under the `claude-md` section:

```json
{
  "claude-md": {
    "subdirs": true,
    "fileNames": ["CLAUDE.md", "AGENTS.md"],
    "refreshInterval": 3,
    "rereadInterval": 3,
    "compactRefresh": true
  }
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `subdirs` | `true` | Enable subdirectory context injection |
| `fileNames` | `["CLAUDE.md", "AGENTS.md"]` | Filenames to look for in subdirectories |
| `refreshInterval` | `3` | Re-read root context every N turns |
| `rereadInterval` | `3` | Re-read subdirectory context every N turns |
| `compactRefresh` | `true` | Re-inject root context after compaction |

## Tips

- Put project-specific guidelines in subdirectory CLAUDE.md files so the agent gets them only when working in that area.
- Use `/supi-claude-md refresh` after editing context files mid-session to make changes visible immediately.
- Context is injected as XML `<extension-context>` blocks with a `source="supi-claude-md"` attribute.
