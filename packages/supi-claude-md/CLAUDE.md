# supi-claude-md

Subdirectory context injection and root context refresh for the pi coding agent.

## Architecture

Two capabilities wired into a single extension:

1. **Subdirectory discovery** — `tool_result` handler augments `read`/`write`/`edit`/`ls`/`lsp`/`tree_sitter` tool results with CLAUDE.md/AGENTS.md content from subdirectories below cwd
2. **Root refresh** — `before_agent_start` periodically re-injects root context files (via turn interval), `context` event prunes stale copies

## Key files

- `index.ts` — Extension entry point, all event handlers
- `config.ts` — Config interface, defaults, `loadClaudeMdConfig()`
- `settings-registration.ts` — Registers claude-md settings with the supi-core settings registry
- `state.ts` — `ClaudeMdState` type, `createInitialState()`, `reconstructState()` from real pi `SessionEntry[]` branch data
- `discovery.ts` — `findSubdirContextFiles()`, `filterAlreadyLoaded()`, `extractPathFromToolEvent()`
- `subdirectory.ts` — `formatSubdirContext()`, `shouldInjectSubdir()`
- `refresh.ts` — `shouldRefreshRoot()`, `formatRefreshContext()`, `pruneStaleRefreshMessages()`

## Dependencies

- `@mrclrchtr/supi-core` — `wrapExtensionContext()`, `loadSupiConfig()`, `writeSupiConfig()`, `removeSupiConfigKey()`, `registerSettings()`

## Config

Global: `~/.pi/agent/supi/config.json` — Project: `.pi/supi/config.json`

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

## Testing

- Pure function unit tests in `__tests__/` — no pi mocks needed for discovery, subdirectory, refresh, state
- Config tests use temp directories with `homeDir` parameter injection
- Run: `pnpm vitest run packages/supi-claude-md/`

## Gotchas

- Settings are managed via `/supi-settings` (unified supi settings command) — claude-md registers its settings via `registerClaudeMdSettings()` in the supi-core registry
- `reconstructState()` must parse real Pi `SessionEntry[]` branch entries (`message` + nested `message.role`, `custom_message`) and restore the highest `supi-claude-md-N` counter to avoid refresh-token collisions after `/reload`
- Path-aware tool discovery should treat `tree_sitter` like `lsp` (`input.file`) so AST-first workflows still inject subdirectory context
- `systemPromptOptions` is accessed via a typed intersection (`BeforeAgentStartEvent & { systemPromptOptions?: ... }`) for forward-compatibility with pi >= 0.68.0
- `os.homedir()` cannot be mocked in ESM — config functions accept optional `homeDir` parameter for testability
- Post-compaction refresh is **not needed**: pi's system prompt (which contains root context files) survives compaction and is re-sent every turn
