# @mrclrchtr/supi-claude-md

Subdirectory context for PI — your project's conventions follow the agent wherever it goes.

Pi loads your root `CLAUDE.md` by default. Claude-MD extends that downward: when the agent reaches into `src/auth/`, it picks up `src/auth/CLAUDE.md` too. Conventions are where the code is, not just at the project root.

Then it helps you keep those files in shape — audit quality, flag stale sections, and capture session learnings with your approval.

## What you get

### Context that travels

Reads, writes, edits, LSP operations — any time the agent touches a file, it picks up the nearest `CLAUDE.md` or `AGENTS.md` in that directory. Conventions arrive exactly when they're needed, not dumped upfront.

### Smart about when to refresh

First-time discovery always injects. Re-reads wait a configurable number of turns and skip when the context window is too full. No flooding.

### CLAUDE.md maintenance

Two bundled skills:

- **claude-md-improver** — audit every CLAUDE.md in your repo. Flags redundancy, stale sections, and content already covered by SuPi's auto-injected context. Suggests targeted updates.
- **claude-md-revision** — capture what you learned this session into CLAUDE.md. Ask the agent to remember a pattern, convention, or gotcha — it proposes the edit, you approve.

## Install

```bash
pi install npm:@mrclrchtr/supi-claude-md
```

## Settings

Configure via `/supi-settings` or directly in config:

```json
{
  "claude-md": {
    "subdirs": true,
    "rereadInterval": 3,
    "contextThreshold": 80,
    "fileNames": ["CLAUDE.md", "AGENTS.md"]
  }
}
```

- `subdirs` — toggle subdirectory discovery on/off
- `rereadInterval` — turns between re-reading a directory's context (0 = never re-read)
- `contextThreshold` — skip re-reads when context usage is above this percent
- `fileNames` — which filenames to look for (comma-separated)
