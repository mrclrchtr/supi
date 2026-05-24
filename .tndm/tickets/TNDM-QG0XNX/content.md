# Split mega-tools into focused tools

Replace three mega-tools with 12 focused, single-purpose tools:

| Mega-tool | Actions/Kinds | → Focused tools | Package |
|---|---|---|---|
| `tree_sitter` | 6 actions | 6 tools | `supi-tree-sitter` |
| `lsp_lookup` | 4 kinds | 4 tools | `supi-lsp` |
| `lsp_refactor` | 2 kinds | 2 tools | `supi-lsp` |

Each focused tool gets its own declarative spec, per-action guidance, and simplified parameter schema. No `action` or `kind` multiplexing. Runtime validation moves into TypeBox schemas where possible.

## Change A: tree_sitter — 1 → 6 focused tools

Remove the single `tree_sitter` tool with its `action` parameter. Register six focused tools:

| Tool | Parameters | Language scope |
|---|---|---|
| `tree_sitter_outline` | `file` | JS/TS only |
| `tree_sitter_imports` | `file` | JS/TS only |
| `tree_sitter_exports` | `file` | JS/TS only |
| `tree_sitter_node_at` | `file`, `line`, `character` | All supported |
| `tree_sitter_query` | `file`, `query` | All supported |
| `tree_sitter_callees` | `file`, `line`, `character` | Many supported |

Each tool gets its own spec (derived from current `action-specs.ts` metadata) with per-action guidance in the tool description and prompt guidelines. The `tree-sitter.ts` file shrinks from ~300 lines to a thin extension shell delegating to a new `tool/register-tools.ts`. The `action` parameter, switch dispatch, and runtime validation of `requiresPosition`/`requiresQuery` are replaced by per-tool TypeBox schemas.

## Change B: lsp_lookup — 1 → 4 focused tools

Remove the single `lsp_lookup` tool with its `kind` parameter. Register four focused tools:

| Tool | Schema |
|---|---|
| `lsp_hover` | `{ file, line: ≥1, character: ≥1 }` |
| `lsp_definition` | `{ file, line: ≥1, character: ≥1 }` |
| `lsp_references` | `{ file, line: ≥1, character: ≥1 }` |
| `lsp_implementation` | `{ file, line: ≥1, character: ≥1 }` |

All four get server-coverage guidance bullets (currently only `lsp_lookup` got them). The `LSP_TOOL_NAMES` list grows from 6 to 9 entries. The activation/deactivation system handles the additional tools automatically.

## Change C: lsp_refactor — 1 → 2 focused tools

Remove the single `lsp_refactor` tool with its `kind` parameter. Register two focused tools:

| Tool | Schema |
|---|---|
| `lsp_rename` | `{ file, line: ≥1, character: ≥1, newName: string }` |
| `lsp_code_actions` | `{ file, line: ≥1, character: ≥1 }` |

`newName` moves from runtime validation to a required TypeBox field — the schema enforces it, not a validation-error string. `LSP_TOOL_NAMES` grows from 9 to 10 entries.

## What doesn't change

- `lsp_document_symbols`, `lsp_workspace_symbols`, `lsp_diagnostics`, `lsp_recover` — already focused tools, stay as-is
- Session-scoped service registries, diagnostic injection, workspace recovery — untouched
- The LSP activation/deactivation system (`LSP_TOOL_NAMES`, `ensureLspToolsActive`, `removeLspTools`) — works identically with more entries
- The shared `tool-framework.ts` in `supi-core` — not used here (separate migration, tracked as follow-up)

## Downstream impact

| File | Change |
|---|---|
| `supi-debug/src/status-log.ts` | Replace 3 tool names with 12 |
| `supi-code-intelligence/src/actions/callees-action.ts` | Update guidance strings from `lsp_lookup` to `lsp_hover` |

## Constraints

- Additive within each package — existing tool registration patterns stay intact, just more tools
- No changes to `supi-lsp/api` or `supi-tree-sitter/api` public surfaces
- The shared `tool-framework.ts` from `supi-core` is NOT used (separate follow-up)
- TDD by default