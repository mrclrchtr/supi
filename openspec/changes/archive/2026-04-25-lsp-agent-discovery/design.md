## Context

The `lsp` tool requires exact `(file, line, character)` coordinates. Agents exploring unfamiliar code default to `grep` and `read` because LSP doesn't support fuzzy symbol search or name-based resolution. When inline diagnostics appear after `write`/`edit`, agents don't see LSP-powered suggestions (hover info, code actions) that could guide fixes. The goal is to bridge exploration and editing modes without adding prompt nudges (which increase LLM context cost).

## Goals / Non-Goals

**Goals:**
- Add `workspace_symbol` and `search` actions to the `lsp` tool for exploration-friendly symbol lookup
- Add `symbol_hover` action for zero-coordinate hover by symbol name
- Augment inline diagnostics after `write`/`edit` with LSP hover + code_actions at the first error position
- Teach the agent LSP exists by showing it working in diagnostics, not by telling it in prompts

**Non-Goals:**
- Prompt nudges or system prompt modifications (adds LLM cost)
- LSP features that require complex UI (e.g., interactive rename preview)
- Cross-project symbol search (node_modules resolution)
- Performance optimization beyond 500ms timeouts for augmentation

## Decisions

### 1. `workspace_symbol` as raw LSP passthrough

**Decision**: `workspace_symbol` action accepts a `query` string and returns raw `SymbolInformation[]` / `WorkspaceSymbol[]` from the LSP server, formatted as a concise list.

**Rationale**: Different LSP servers return different symbol formats. Rather than normalizing, we format what we get. The agent can then use `hover`/`definition` on any match.

**Alternative**: Normalize to a custom schema. Rejected — adds complexity, loses server-specific detail.

### 2. `search` action chains workspace_symbol → grep fallback

**Decision**: `search` first tries `workspace_symbol`, then falls back to `grep`-style text search if LSP returns nothing.

**Rationale**: `workspace_symbol` only indexes the project, not node_modules. For library exploration, grep is still needed. Chaining gives the best of both.

**Alternative**: Only workspace_symbol. Rejected — too limited for library exploration.

### 3. Symbol-name hover resolves via workspace_symbol first

**Decision**: `symbol_hover` accepts `symbol: string`, calls `workspace_symbol` internally, takes the first match, then calls `hover` at that position.

**Rationale**: Zero coordinates, single tool call. The agent doesn't need to know the file path.

**Alternative**: Accept `file` + approximate `line` and search nearby. Rejected — more complex, less reliable.

### 4. Diagnostic augmentation: hover + code_actions, first error only

**Decision**: After `write`/`edit`, if there are severity-1 errors, fetch `hover` + `code_actions` at the first error position and append to the diagnostic text.

**Rationale**: Shows the agent what LSP can do without extra tool calls. Limits scope to avoid overwhelming output and excessive LSP traffic.

**Constraints**: 500ms timeout for both calls combined, only severity-1 errors, only first error per file.

### 5. No change to existing tool result shape

**Decision**: Augmented diagnostics append text to the existing `content` array. No new fields, no schema changes.

**Rationale**: Backward compatible. The agent already reads the diagnostic text.

## Risks / Trade-offs

- **LSP server may not support workspace/symbol** → `search` falls back to grep; `symbol_hover` returns "symbol not found"
- **Diagnostic augmentation adds latency** → 500ms timeout, silent failure if LSP is slow
- **Too much appended text** → Only first error, only severity-1, truncated hover to 3 lines
- **Multiple symbols with same name** → `symbol_hover` picks first match; agent can use `search` to disambiguate
