# supi-claude-md

Subdirectory context injection for the pi coding agent.

## Architecture

One capability wired into a single extension:

1. **Subdirectory discovery** — `tool_result` handler augments `read`/`write`/`edit`/`ls`/`lsp`/`tree_sitter` tool results with CLAUDE.md/AGENTS.md content from subdirectories below cwd

Root and ancestor instruction files are loaded natively by pi into the system prompt on every turn. SuPi does not re-inject them.

## Key files

- `index.ts` — Extension entry point, all event handlers
- `config.ts` — Config interface, defaults, `loadClaudeMdConfig()`
- `settings-registration.ts` — Registers claude-md settings with the supi-core settings registry
- `state.ts` — `ClaudeMdState` type, `createInitialState()`, `reconstructState()` from real pi `SessionEntry[]` branch data
- `discovery.ts` — `findSubdirContextFiles()`, `filterAlreadyLoaded()`, `extractPathFromToolEvent()`
- `subdirectory.ts` — `formatSubdirContext()`, `shouldInjectSubdir()`

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

- Pure function unit tests in `__tests__/` — no pi mocks needed for discovery, subdirectory, state
- Config tests use temp directories with `homeDir` parameter injection
- Run: `pnpm vitest run packages/supi-claude-md/`

## Gotchas

- Settings are managed via `/supi-settings` (unified SuPi settings command) — claude-md registers its section via `registerClaudeMdSettings()` in the supi-core registry, with `rereadInterval` and `fileNames` edited through `SettingItem.submenu` text inputs
- `reconstructState()` must parse real Pi `SessionEntry[]` branch entries (`message` + nested `message.role`, `custom_message`) and restore subdirectory injection state from tool-result `<extension-context>` tags
- Path-aware tool discovery should treat `tree_sitter` like `lsp` (`input.file`) so AST-first workflows still inject subdirectory context
- `systemPromptOptions` is accessed via a typed intersection (`BeforeAgentStartEvent & { systemPromptOptions?: ... }`) for forward-compatibility with pi >= 0.68.0
- `os.homedir()` cannot be mocked in ESM — config functions accept optional `homeDir` parameter for testability
- Root/native context files are never re-injected by this extension; they live in pi's system prompt. Use `/reload` or restart the session to pick up changes to root instruction files
