# supi-claude-md

Subdirectory context injection and root context refresh for the pi coding agent.

## Architecture

Two capabilities wired into a single extension:

1. **Subdirectory discovery** — `tool_result` handler augments `read`/`write`/`edit`/`ls`/`lsp` tool results with CLAUDE.md/AGENTS.md content from subdirectories below cwd
2. **Root refresh** — `before_agent_start` returns persistent messages with root context, `context` event prunes stale copies

## Key files

- `index.ts` — Extension entry point, all event handlers, `/supi-claude-md` command
- `config.ts` — Config interface, defaults, `loadClaudeMdConfig()`
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

- `systemPromptOptions` may not be in pi's published types but exists at runtime on `BeforeAgentStartEvent` — cast via `as unknown`
- `scanForContextFiles` uses `require()` for lazy fs/path loading in command handler context
- Module-level `extensionState` variable lets command handlers access the state object
- `os.homedir()` cannot be mocked in ESM — config functions accept optional `homeDir` parameter for testability
