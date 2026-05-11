# supi-claude-md

Subdirectory context injection for the pi coding agent.

## Architecture

One capability wired into a single extension:

1. **Subdirectory discovery**: `tool_result` handler augments `read`/`write`/`edit`/`ls`/`lsp`/`tree_sitter` tool results with CLAUDE.md/AGENTS.md content from subdirectories below cwd

Root and ancestor instruction files are loaded natively by pi into the system prompt on every turn. SuPi does not re-inject them.

## Key files

- `index.ts`: extension entry point, all event handlers
- `config.ts`: config interface, defaults, `loadClaudeMdConfig()`
- `settings-registration.ts`: registers claude-md settings with the supi-core settings registry
- `state.ts`: `ClaudeMdState` type, `createInitialState()`, `reconstructState()` from real pi `SessionEntry[]` branch data
- `discovery.ts`: `findSubdirContextFiles()`, `filterAlreadyLoaded()`, `extractPathFromToolEvent()`
- `subdirectory.ts`: `formatSubdirContext()`, `shouldInjectSubdir()`

## Dependencies

- `@mrclrchtr/supi-core`: `wrapExtensionContext()`, `loadSupiConfig()`, `writeSupiConfig()`, `removeSupiConfigKey()`, `registerSettings()`

> Note: `@earendil-works/pi-tui` remains in `peerDependencies` for historical installs but is no longer imported by this package.

## Skills

Two skills are shipped under `skills/`:

- `claude-md-improver`: bulk audit and scoring of CLAUDE.md files across the repo. Includes SuPi-aware baseline review: compares CLAUDE.md sections against the context already delivered by `supi-code-intelligence` (workspace module graph) and `supi-claude-md` (subdirectory injection), then flags redundant sections or compressible overlap
- `claude-md-revision`: targeted session-capture additions to CLAUDE.md

Both skills share a set of reference files (`references/quality-criteria.md`, `references/templates.md`, `references/update-guidelines.md`). The revision skill duplicates these for self-containment. **When editing one copy, keep the other in sync**; `__tests__/skill-references-sync.test.ts` enforces this.

## Config

Global: `~/.pi/agent/supi/config.json`; project: `.pi/supi/config.json`

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

## Commands

```bash
pnpm vitest run packages/supi-claude-md/
pnpm exec tsc --noEmit -p packages/supi-claude-md/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-claude-md/__tests__/tsconfig.json
pnpm exec biome check packages/supi-claude-md/
```

## Testing

- Pure function unit tests in `__tests__/`: no pi mocks needed for discovery, subdirectory, state
- Config tests use temp directories with `homeDir` parameter injection

## Gotchas

- Settings are managed via `/supi-settings` (unified SuPi settings command): claude-md registers its section via `registerClaudeMdSettings()` in the supi-core registry, with `rereadInterval` and `fileNames` edited through `SettingItem.submenu` text inputs
- `reconstructState()` must parse real Pi `SessionEntry[]` branch entries (`message` + nested `message.role`, `custom_message`) and restore subdirectory injection state from tool-result `<extension-context>` tags
- Path-aware tool discovery should treat `tree_sitter` like `lsp` (`input.file`) so AST-first workflows still inject subdirectory context
- `systemPromptOptions` is accessed via a typed intersection (`BeforeAgentStartEvent & { systemPromptOptions?: ... }`) for forward-compatibility with pi >= 0.68.0
- `os.homedir()` cannot be mocked in ESM: config functions accept optional `homeDir` parameter for testability
- Root/native context files are never re-injected by this extension; they live in pi's system prompt. Use `/reload` or restart the session to pick up changes to root instruction files
- Subdirectory context is injected from path-aware tool activity such as reads, writes, edits, LSP operations, and Tree-sitter operations
- Each directory is injected at most once per session (by default). After the configured `rereadInterval` turns, the content is re-read in case it changed
- Re-injection of already-seen directories is skipped when context usage is at or above `contextThreshold`. First-time directory discovery is still injected even under context pressure

## Injection pipeline

The extension operates through three stages on `tool_result` events:

1. **Path extraction** (`discovery.ts`): identifies file paths from tool input (reads, writes, edits, LSP, and Tree-sitter operations). Determines parent directories to scan.
2. **Subdirectory scan** (`discovery.ts`): walks from the deepest subdirectory up to (but not including) cwd, checking for ordered `fileNames`. Skips directories already injected this session.
3. **Context formatting** (`subdirectory.ts`): wraps discovered file content in `<extension-context source="supi-claude-md">` blocks and appends them to the tool result.

Root and ancestor files are handled natively by pi's system prompt. This extension never re-injects them. Use `/reload` to refresh native root context.

Reread and threshold gating (`shouldInjectSubDir()` in `subdirectory.ts`): first-time discovery always passes; re-injection is controlled by `rereadInterval` turns and gated by context-usage percentage.
