## Why

Agents working in unfamiliar codebases lack structural understanding: they can't find the right code, can't connect components, and operate at the wrong abstraction level. This leads to imprecise edits and slow fix-and-check loops. While `supi-lsp` provides raw point queries (hover, definition, references), it doesn't synthesize information into navigational or architectural insight.

## What Changes

- Add a new `supi-code-intel` workspace package that registers a `code_intel` tool with subcommands: `callers`, `implementations`, `pattern`, `brief`, `affected`
- Auto-inject a lightweight architecture overview at session start (module map, key APIs, dependency edges) so the agent has immediate codebase context
- Provide on-demand deep-dive queries that synthesize LSP output into summarized, actionable results (grouped call sites, blast-radius analysis, focused architecture briefs)
- Layer on top of `supi-lsp`'s `LspManager` — no replacement or duplication of raw LSP tool actions

## Capabilities

### New Capabilities

- `code-intel-search`: Smart code search tool — callers, implementations, and pattern search with structured, summarized output. Wraps LSP for semantic queries and `rg` for text fallback.
- `code-intel-brief`: Architecture briefing — auto-injected session-start overview and on-demand focused briefs for specific code areas. Scans package.json, exports, and dependency structure.
- `code-intel-affected`: Blast-radius analysis — given a symbol, reports what files and modules would be affected by a change. Aggregates LSP references and dependency edges.

### Modified Capabilities

(No existing specs require modification — this package consumes `supi-lsp` as a dependency but doesn't change its behavior.)

## Impact

- **New package**: `packages/supi-code-intel/` added to the workspace
- **Root manifest**: `package.json` pi manifest gains a new extension entry
- **Dependencies**: `supi-code-intel` depends on `supi-lsp` (imports `LspManager`), `supi-core`, and pi peer dependencies
- **Agent prompt**: New tool appears in the system prompt via `promptSnippet` and `promptGuidelines`
- **No breaking changes** to existing packages or tools
