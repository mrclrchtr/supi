## Why

Both `supi-claude-md` and `supi-lsp` inject context messages with `customType` (`supi-claude-md-refresh` and `lsp-context`) but set `display: false`, making them invisible to the user. The LSP extension already shows diagnostic summaries via ephemeral `notify()` calls that fade after seconds — but there's no persistent, collapsible record in the conversation. Users have no way to see what context is being injected, when it refreshes, or what diagnostics are active. `registerMessageRenderer` is an existing pi API that can make these messages visible with themed, collapsible rendering.

## What Changes

- Change `supi-claude-md-refresh` messages from `display: false` to `display: true`
- Change `lsp-context` messages from `display: false` to `display: true`
- Register a `registerMessageRenderer` for `"supi-claude-md-refresh"` in `supi-claude-md` — shows a themed collapsible summary (which files were refreshed, token count)
- Register a `registerMessageRenderer` for `"lsp-context"` in `supi-lsp` — shows a themed collapsible summary (diagnostics overview: errors/warnings counts, severity mode)
- Replace the ephemeral `ctx.ui.notify()` call in `supi-lsp` with the persistent rendered message (the notify fades; the rendered message stays in the conversation)
- Add `@mariozechner/pi-tui` as a dependency where needed (for `Box`, `Text` components)

## Capabilities

### New Capabilities
- `context-renderers`: Custom `registerMessageRenderer` implementations for `supi-claude-md-refresh` and `lsp-context` message types, providing themed, collapsible TUI rendering of injected context

### Modified Capabilities
- `lsp-diagnostic-context`: Change `lsp-context` messages from `display: false` to `display: true`; replace ephemeral `notify()` with persistent rendered message
- `root-refresh-dedup`: Change `supi-claude-md-refresh` messages from `display: false` to `display: true`

## Impact

- `packages/supi-claude-md/index.ts` — set `display: true`, add `registerMessageRenderer`
- `packages/supi-lsp/lsp.ts` — set `display: true`, add `registerMessageRenderer`, remove `ctx.ui.notify()` call for diagnostic summary
- `packages/supi-claude-md/package.json` — add `@mariozechner/pi-tui` as dependency (if not already present)
- `packages/supi-lsp/package.json` — add `@mariozechner/pi-tui` as dependency (if not already present)
- Tests for both extensions' message rendering
- No breaking changes — the LLM-facing content of messages stays identical; only the TUI display changes