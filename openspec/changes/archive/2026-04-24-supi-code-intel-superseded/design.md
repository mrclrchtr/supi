## Context

SuPi currently provides `supi-lsp` for raw LSP point queries (hover, definition, references, diagnostics, symbols, rename, code_actions). These are atomic operations that work well when the agent already knows what to look for. However, agents in unfamiliar codebases struggle at three levels:

1. **Can't find the right code** — they don't know the codebase layout or where relevant modules live
2. **Can't connect the dots** — even after reading files, they miss dependencies, data flow, and cross-module relationships
3. **Wrong abstraction level** — they dive into implementation details without understanding the architecture, or vice versa

The agent prompt already includes `supi-lsp` with guidance to prefer it over grep for semantic navigation. What's missing is a synthesis layer that turns raw LSP data into navigational and architectural insight.

The existing `supi-claude-md` extension auto-injects CLAUDE.md content into the agent context. This establishes a pattern for auto-injected context that `supi-code-intel` can follow for architecture briefings.

## Goals / Non-Goals

**Goals:**
- Give agents immediate structural understanding of the codebase at session start
- Provide synthesized, summarized navigational queries (callers, implementations, affected scope)
- Generate focused architecture briefs on demand for specific code areas
- Layer cleanly on top of `supi-lsp` without duplicating or replacing it
- Degrade gracefully when LSP is unavailable (fall back to text-based analysis)

**Non-Goals:**
- Replace or wrap raw LSP actions (hover, definition, rename, code_actions, diagnostics)
- Cache briefs or scan results (YAGNI — generate on demand)
- Support languages beyond what the project's LSP servers cover (though text-based fallback works for any language)
- Modify any existing `supi-lsp` behavior or specs
- Provide real-time file watching or incremental updates

## Decisions

### 1. Single tool with StringEnum subcommand

**Decision:** Register one `code_intel` tool with an `action` parameter using `StringEnum` (matching the `supi-lsp` pattern) rather than multiple separate tools.

**Rationale:** Reduces prompt overhead (one tool entry instead of 3-5), groups related functionality, follows the existing `lsp` tool convention. `StringEnum` is required for Google API compatibility.

**Alternatives considered:**
- Separate tools per action (`code_search`, `code_brief`, `code_affected`) — more prompt tokens, harder to manage active state
- A single tool with a generic query language — too open-ended, harder for the LLM to use correctly

### 2. Import LspManager directly from supi-lsp

**Decision:** Import `LspManager` from `supi-lsp/manager.ts` as a workspace dependency rather than going through the tool interface or duplicating LSP client logic.

**Rationale:** `LspManager` is exported and provides the API needed (references, symbols, definition). Using the tool interface would require mocking tool calls and would lose access to structured LSP responses. Duplicating client logic is wasteful.

**Alternatives considered:**
- Access LSP through the registered `lsp` tool — indirection, no type safety on results
- Duplicate LSP client management — violates DRY, diverges from server lifecycle management

### 3. Auto-inject overview via `before_agent_start` event

**Decision:** Generate and inject the lightweight architecture overview on `before_agent_start` (first turn only), following the `supi-claude-md` context injection pattern.

**Rationale:** `session_start` is too early (LSP servers may not be ready). `before_agent_start` fires after LSP initialization and before the agent's first turn — the right time to provide context. Inject only on the first `before_agent_start` to avoid repeating the overview.

### 4. Architecture brief from project metadata + LSP symbols

**Decision:** Generate briefs by combining `package.json` scanning (dependencies, descriptions), directory structure analysis, and LSP `documentSymbols` for public API extraction.

**Rationale:** `package.json` provides reliable dependency and module boundary information. LSP symbols provide accurate export signatures. Together they give a complete picture without requiring custom parsing.

### 5. Output format: structured markdown with summaries

**Decision:** All tool output uses structured markdown with file:line references, grouped results, and one-line summaries. Output is truncated to pi's 50KB / 2000 line limits.

**Rationale:** Markdown is native to the agent's context. Grouped results (e.g., "5 callers across 3 files") let the agent reason about scope without reading every match. Summaries enable fast triage.

## Risks / Trade-offs

- **LSP startup latency on brief generation** → First `brief` call on a focused area may be slow if LSP servers haven't opened those files yet. Mitigation: the search actions open files via `LspManager.ensureFileOpen()` before querying, which is the same pattern `supi-lsp` uses.

- **No caching means repeated work** → Calling `brief` twice on the same path regenerates from scratch. Mitigation: acceptable for now; the API is designed so caching can be added later without breaking changes.

- **Token cost of auto-injected overview** → Every session gets the architecture overview in context. Mitigation: keep the overview lightweight (module names, one-line descriptions, dependency edges — not full API listings). Target under 500 tokens.

- **`supi-lsp` internal coupling** → Importing `LspManager` ties `supi-code-intel` to `supi-lsp`'s internal API. Mitigation: `LspManager`'s public interface is stable (it's the core of the LSP extension). If it changes, `supi-code-intel` is in the same monorepo and can be updated in sync.
