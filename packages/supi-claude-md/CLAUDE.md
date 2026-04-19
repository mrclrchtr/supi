# supi-claude-md

Subdirectory context injection and root context refresh for the pi coding agent.

## Architecture

Two capabilities wired into a single extension:

1. **Subdirectory discovery** — `tool_result` handler augments `read`/`write`/`edit`/`ls`/`lsp` tool results with CLAUDE.md/AGENTS.md content from subdirectories below cwd
2. **Root refresh** — `before_agent_start` returns persistent messages with root context, `context` event prunes stale copies

## Key files

- `index.ts` — Extension entry point, all event handlers, `/supi-claude-md` command
- `config.ts` — Config interface, defaults, `loadClaudeMdConfig()`
- `settings.ts` — Interactive settings overlay (`/supi-claude-md settings`), TUI component with scope toggle, `SettingsList`, and interval `Input`
- `commands.ts` — Subcommand routing for `/supi-claude-md` (status, refresh, list, interval, subdirs, compact, settings)
- `state.ts` — `ClaudeMdState` type, `createInitialState()`, `reconstructState()`
- `discovery.ts` — `findSubdirContextFiles()`, `filterAlreadyLoaded()`, `extractPathFromToolEvent()`
- `subdirectory.ts` — `formatSubdirContext()`, `shouldInjectSubdir()`
- `refresh.ts` — `shouldRefreshRoot()`, `formatRefreshContext()`, `pruneStaleRefreshMessages()`

## Dependencies

- `@mrclrchtr/supi-core` — `wrapExtensionContext()`, `loadSupiConfig()`, `writeSupiConfig()`, `removeSupiConfigKey()`

## Config

Global: `~/.pi/agent/supi/config.json` — Project: `.pi/supi/config.json`

```json
{
  "claude-md": {
    "rereadInterval": 3,
    "subdirs": true,
    "compactRefresh": true,
    "fileNames": ["CLAUDE.md", "AGENTS.md"]
  }
}
```

## Testing

- Pure function unit tests in `__tests__/` — no pi mocks needed for discovery, subdirectory, refresh, state
- Config tests use temp directories with `homeDir` parameter injection
- Run: `pnpm vitest run packages/supi-claude-md/`

## Gotchas

- `/supi-claude-md settings` opens an interactive TUI overlay; other subcommands (`interval`, `subdirs`, `compact`) remain as text-based alternatives
- `settings.ts` uses `ctx.ui.custom()` with `SettingsList` from `@mariozechner/pi-tui` for boolean toggles and a custom `Input` for interval editing
- The overlay's `handleInput` is split into `handleEditingInput` and `handleNavigateInput` to satisfy Biome's cognitive complexity limits
- `systemPromptOptions` is accessed via a typed intersection (`BeforeAgentStartEvent & { systemPromptOptions?: ... }`) for forward-compatibility with pi >= 0.68.0
- `scanForContextFiles` uses `require()` for lazy fs/path loading in command handler context
- Module-level `extensionState` variable lets command handlers access the state object
- `os.homedir()` cannot be mocked in ESM — config functions accept optional `homeDir` parameter for testability
