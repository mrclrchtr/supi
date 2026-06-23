# Phase 2a: add `code_find` as V2 unified search tool

## Design

Evolve the existing `code_pattern` (literal/regex/structured) into `code_find` — a unified public search tool with ranked, mode-aware results. `code_pattern` stays registered during the transition and is removed in a follow-up cleanup ticket once `code_find` is stable.

### Schema (from `src/workflow/schemas.ts` — already approved)

```ts
code_find({
  query: string,          // required — search pattern or symbol query
  scope?: string,         // workspace-relative path/package/dir
  mode?: "text" | "regex" | "ast" | "semantic",  // defaults to "text"
  kind?: "definition" | "import" | "export" | "call" | "type" | "test",
  contextLines?: number,  // match context lines (default 1)
  maxResults?: number,    // result cap (default 8)
})
```

### Mode dispatch

| mode | Implementation | Notes |
|---|---|---|
| `text` (default) | ripgrep literal | Same as current `code_pattern` default |
| `regex` | ripgrep regex | Same as current `code_pattern` with `regex: true` |
| `ast` | tree-sitter structured (existing `kind` dispatch) | Requires structural provider; same as `code_pattern` with `kind` |
| `semantic` | LSP workspace symbols | New mode — falls back to text search when LSP unavailable |

### `kind` filtering

- `kind` is orthogonal to `mode` — it filters/ranks results rather than changing the search substrate.
- In `ast` mode: `kind` maps 1:1 to the structural query types (`definition`/`export`/`import`). Extended kinds (`call`, `type`, `test`) return unavailable for now.
- In `text`/`regex`/`semantic` modes: `kind` is a best-effort ranking filter applied to raw results.

### Result ranking

- `text`/`regex`: by match count per file, then alphabetical
- `ast`: structural confidence ordering
- `semantic`: LSP relevance score
- Omitted-count + next-query hints in details, consistent with other `code_*` tools

## Files

### New files
- `packages/supi-code-intelligence/src/tool/execute-find.ts` — executor with mode dispatch
- `packages/supi-code-intelligence/__tests__/unit/code-find-tool.test.ts` — unit tests
- `packages/supi-code-intelligence/src/presentation/markdown/find.ts` — markdown renderer (if needed beyond pattern renderer)

### Modified files
- `packages/supi-code-intelligence/src/tool/tool-specs.ts` — add `code_find` spec entry
- `packages/supi-code-intelligence/src/intent/types.ts` — add `"code_find"` to `CODE_INTELLIGENCE_TOOL_NAMES`
- `packages/supi-code-intelligence/src/tool/guidance.ts` — auto-derived from specs, no manual edit needed
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` — add `code_find` registration assertion
- `packages/supi-code-intelligence/CLAUDE.md` — update public tool contracts and architecture

### No changes needed
- `src/workflow/schemas.ts` — schema already defined
- `src/workflow/surface.ts` — spec already documented
- `src/workflow/names.ts` — already includes `code_find`
- `src/tool/execute-pattern.ts` — stays unchanged (code_pattern is kept)
- `src/use-case/generate-pattern.ts` — reused directly by code_find's text/regex/ast modes

## Non-goals

- Does not remove `code_pattern` — that is a follow-up cleanup.
- Does not implement `natural` mode — no implementation exists.
- Does not implement `call`/`type`/`test` `kind` values beyond returning "unavailable — not yet implemented."
- Does not change the `code_find` schema from what is already in `src/workflow/schemas.ts`.

## Verification

- All 346 existing tests must continue to pass.
- New `code-find-tool.test.ts` covers mode dispatch, kind filtering, ranking, unavailable states.
- Extension registration test confirms `code_find` appears and has correct parameter shape.
- Manual smoke: `/reload`, verify `code_find` appears in tool list, test each mode.
