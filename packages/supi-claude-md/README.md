# @mrclrchtr/supi-claude-md

Subdirectory context for PI — your project's conventions follow the agent wherever it goes.

Pi loads your root `CLAUDE.md` by default. Claude-MD extends that downward: when the agent reaches into `src/auth/`, it picks up `src/auth/CLAUDE.md` too. Conventions are where the code is, not just at the project root.

Then it helps you keep those files in shape — audit quality, flag stale sections, and capture session learnings with your approval.

## What you get

### Context that travels

Reads, writes, edits, LSP operations — any time the agent touches a file, it picks up the nearest `CLAUDE.md` or `AGENTS.md` in that directory. Each subdirectory's context is injected once (on first discovery) and available for the rest of the session.

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
    "fileNames": ["CLAUDE.md", "AGENTS.md"]
  }
}
```

- `subdirs` — toggle subdirectory discovery on/off
- `fileNames` — which filenames to look for (comma-separated)
