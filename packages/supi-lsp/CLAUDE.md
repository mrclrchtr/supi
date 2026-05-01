# CLAUDE.md

This file provides guidance to Claude Code when working in `packages/supi-lsp/`.

## Scope

`@mrclrchtr/supi-lsp` provides a registered `lsp` tool, inline diagnostics surfaced around `write` and `edit`, and agent guidance that nudges semantic tooling over raw text search.

Entrypoint: `lsp.ts`

## Key files

- `lsp.ts` — extension registration, tool wiring, `before_agent_start` handler (diagnostic context), `session_tree` handler (tool activation restore)
- `tree-persist.ts` — `appendEntry`/`session_tree` persistence for LSP tool activation state
- `guidance.ts` — `buildProjectGuidelines()`, stable system-prompt `promptGuidelines`, diagnostic formatting
- `manager.ts` — client/server lifecycle and state
- `summary.ts` — formatting/relevance helpers; keep summary logic here to avoid bloating `manager.ts`
- `scanner.ts` — project scanning/guidance coverage logic
- `diagnostics.ts`, `diagnostic-summary.ts`, `ui.ts` — diagnostic shaping and presentation
- `config.ts` — `.pi-lsp.json` handling (server definitions only)
- `settings-registration.ts` — supi shared config settings (`enabled`, `severity`, `servers`)

## Behavior notes

- Per-project config lives in `.pi-lsp.json` at the project root. YAML is intentionally unsupported.
- The `lsp` tool advertises semantic-first guidance via `promptSnippet` / `promptGuidelines`; these guidelines are part of pi's stable system prompt.
- `buildProjectGuidelines()` includes LSP Tool Priority-style instructions and active server/action details. It is applied by re-registering the tool at `session_start`, so guidance is baked into `_baseSystemPrompt` without per-turn mutation.
- `before_agent_start` must not return `systemPrompt`; keep stable guidance in session-start `promptGuidelines` and reserve dynamic XML-framed custom messages for diagnostics only.
- The combined effect: system prompt guidelines tell the agent *when/how* to prefer LSP (directional, persistent), and diagnostic context messages tell it *what needs fixing* (dynamic, turn-by-turn).
- `/reload` reruns `session_start`; use it to refresh proactive scans, eager server startup, and rebuilt `promptGuidelines`.
- `/lsp-status` should merge proactive scan roots with lazily started clients; do not assume UI state can rely on the session-start scan snapshot alone.
- Use `pi.on("tool_result")` to append inline diagnostics to `write` / `edit` output.
- After `write`/`edit`, severity-1 diagnostics are augmented with LSP `hover` (truncated to 3 lines) and `code_actions` (titles listed) at the first error position, with a 500ms timeout per call.
- The `lsp` tool supports `workspace_symbol`, `search`, and `symbol_hover` actions for symbol exploration without exact coordinates.
- Tool activation state is persisted via `pi.appendEntry()` and restored on `session_tree` navigation. When LSP is enabled/disabled, `persistLspActiveState`/`persistLspInactiveState` appends a `lsp-active` entry. On `/tree` navigation, `registerTreePersistHandlers` inspects the branch for the last `lsp-active` entry and restores the tool set accordingly.

## Settings

LSP settings are managed via the supi shared config system and the `/supi-settings` command:

```json
{
  "lsp": {
    "enabled": true,
    "severity": 1,
    "servers": ["typescript-language-server", "pyright"]
  }
}
```

- `enabled` (boolean, default `true`) — enable/disable all LSP functionality
- `severity` (number 1-4, default `1`) — inline diagnostic threshold (`1` = errors only)
- `servers` (string array, default `[]`) — allow-list active servers; empty means all servers enabled

Settings are registered with the supi-core settings registry via `registerLspSettings()` in `lsp.ts`. The server allowlist is applied in `session_start` after loading config, not inside `loadConfig()`.

## Packaging/runtime gotchas

- `typebox` 1.x is the runtime import (migrated from `@sinclair/typebox` 0.34.x for pi >= 0.69.0).
- Use `StringEnum` from `@mariozechner/pi-ai` for string enums in tool parameters — `Type.Union`/`Type.Literal` doesn't work with Google's API.
- Prefer splitting `manager.ts` helpers into focused `manager-*.ts` modules over relaxing the repo-wide Biome line-limit rule.
- `process.cwd()` is no longer used for path resolution; `ctx.cwd` from the extension context is threaded through `LspManager` and all formatting utilities. When adding new formatting helpers that need relative paths, accept `cwd` as a parameter.
- `LspManager` constructor: `new LspManager(config, cwd)` — `cwd` is required.
- `manager.getOutstandingDiagnostics(maxSeverity)` returns `{ file, diagnostics: Diagnostic[] }[]` with full messages and line numbers.

## Testing

Useful commands:
```bash
pnpm exec vitest run packages/supi-lsp/__tests__/guidance.test.ts
pnpm exec vitest run packages/supi-lsp/__tests__/scanner.test.ts
pnpm exec vitest run packages/supi-lsp/__tests__/system-prompt.test.ts
```

Testing gotchas:
- Integration tests use `describe.skipIf(!HAS_CMD)` and will auto-skip when required language servers are missing from `PATH`.
- Diagnostics can arrive late in TS integration tests; retry `syncFileAndGetDiagnostics()` before asserting.
