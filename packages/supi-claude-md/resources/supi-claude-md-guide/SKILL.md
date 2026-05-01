---
name: supi-claude-md-guide
description: How supi-claude-md context injection works — subdirectory discovery, root refresh, settings UI, and configuration.
---

# Context Injection Guide

## How it works

supi-claude-md gives the agent project context beyond what pi loads natively:

1. **Subdirectory discovery** — when the agent accesses files in a subdirectory, CLAUDE.md/AGENTS.md files from that directory (and its ancestors up to cwd) are injected into the tool result.
2. **Root refresh** — root/ancestor context files that pi loaded natively are periodically re-read and re-injected so the agent sees fresh content.

## Subdirectory discovery

When the agent touches a path-aware tool target such as `packages/my-lib/src/foo.ts`, supi-claude-md checks for context files in:
- `packages/my-lib/`
- `packages/`

This can be triggered by reads, writes, edits, and other path-aware tooling such as LSP operations. It injects any CLAUDE.md or AGENTS.md found there directly into the tool result. The agent sees this context automatically — no action needed.

Each directory is injected at most once per session (by default). After the configured `rereadInterval` turns, the content is re-read in case it changed.

Re-injection is skipped when context usage is at or above `contextThreshold`. First-time directory discovery is still injected even under context pressure.

## Root refresh

Context files loaded natively by pi (like the root AGENTS.md) may go stale as the session progresses. supi-claude-md periodically re-reads and re-injects these files via a persistent message in `before_agent_start`.

Refresh timing is controlled by the `rereadInterval` config option (default: every 3 turns). Set to `0` to disable.

Root refresh is skipped when context usage is at or above `contextThreshold` (default: 80%). Set `contextThreshold` to `100` to disable context gating.

Note: pi's system prompt already contains root context files and is re-sent on every LLM call. Root refresh is for **updating** the content when files change mid-session, not for re-adding missing context after compaction.

## Settings

Run `/supi-settings` to open the interactive settings UI. It opens directly in the pi interface, replaces the editor area, and shows the current effective configuration with keyboard navigation:

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate between settings |
| `Enter` | Edit / toggle the selected setting |
| `Tab` | Switch between Project and Global scope |
| `Esc` | Close the settings UI |

Changes are persisted immediately to the selected scope's config file.

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
| `fileNames` | `["CLAUDE.md", "AGENTS.md"]` | Filenames to look for in subdirectories |
| `rereadInterval` | `3` | Re-read root and subdirectory context every N turns (0 = off) |
| `contextThreshold` | `80` | Skip refresh/re-injection when context usage is at or above this percent (100 = off) |

## Tips

- Put project-specific guidelines in subdirectory CLAUDE.md files so the agent gets them only when working in that area.
- Use the settings UI (`/supi-settings`) to adjust `rereadInterval` or `contextThreshold` mid-session — changes take effect on the next turn.
- Context is injected as XML `<extension-context>` blocks with a `source="supi-claude-md"` attribute.
