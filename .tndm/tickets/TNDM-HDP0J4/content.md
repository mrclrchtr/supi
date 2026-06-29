# Merge code_references, code_calls, code_implementations into code_graph

## Summary

Replace three separate relation tools with a single `code_graph` tool whose `relations` array param selects which relation families to return. The `CodeGraphParameters` schema already exists in `workflow/schemas.ts`. Underlying analysis services and renderers already exist. This is a tool-surface consolidation — no new analysis logic is needed.

## Design

### Public schema (extending existing CodeGraphParameters)

```ts
code_graph({
  targetId?: string,           // from code_resolve (preferred)
  file?: string,               // raw coordinates (fallback)
  line?: number,
  character?: number,
  symbol?: string,
  path?: string,
  relations?: ["references", "callees", "imports", "exports", "implements", "tests"],
  direction?: "in" | "out" | "both",  // future, no-op for now
  depth?: number,                      // future, no-op for now
  maxNodes?: number,                   // future, no-op for now
  maxResults?: number,
})
```

### Default behavior

When `relations` is omitted, defaults to `["references"]` — making it a drop-in replacement for the most common `code_references` use case.

### Relation → substrate mapping (internal)

| relation | substrate | service |
|---|---|---|
| `references` | semantic (LSP) | `analysis/references/service.ts` |
| `implements` | semantic (LSP) | `analysis/implementations/service.ts` |
| `callees` | structural (tree-sitter) | `analysis/calls/service.ts` |
| `imports` | structural | "not yet implemented" |
| `exports` | structural | "not yet implemented" |
| `tests` | N/A | "not yet implemented" |

### Availability strategy

If a requested relation's substrate is unavailable, skip it with a note rather than failing the whole call. Each relation is best-effort.

## Files changed

### New
- `tool/execute-graph.ts` — unified executor delegating to existing services

### Modified
- `intent/types.ts` — add `"code_graph"`, remove `"code_references"`, `"code_calls"`, `"code_implementations"` from `CodeIntelligenceToolName`
- `analysis/routing/planner.ts` — add `code_graph` routing case
- `tool/tool-specs.ts` — add code_graph spec, remove old three specs
- `presentation/markdown/relations.ts` — add `renderGraphResult()` combining multi-relation output
- `CLAUDE.md` — update tool surface documentation
- `__tests__/unit/extension-registration.test.ts` — update tool checks
- `__tests__/unit/planner-routing.test.ts` — update route checks
- `__tests__/helpers/execute-action.ts` — update action shim

### Deleted
- `tool/execute-references.ts`
- `tool/execute-calls.ts`
- `tool/execute-implementations.ts`

### Added tests
- `__tests__/unit/tool/execute-graph.test.ts` — integration tests for code_graph

### Unchanged (internal services)
- `analysis/references/service.ts`
- `analysis/calls/service.ts`
- `analysis/implementations/service.ts`
- `analysis/relations/*`
- `presentation/markdown/references.ts`, `calls.ts`, `implementations.ts` (internal renderers, used by relations.ts)

## Constraints

- No new analysis logic — graph executor delegates to existing services
- `direction`, `depth`, `maxNodes` accepted but ignored (future placeholders)
- `imports`, `exports`, `tests` relations return "not yet implemented" gracefully
- Keep the `CodeRelationsKind` type in intent/types.ts for internal analysis code
- Guidance auto-generates from tool specs — no manual guidance changes needed
