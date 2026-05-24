## Problem

`supi-code-intelligence` accesses its two substrates (LSP, tree-sitter) through two ad-hoc provider files — 27 and 22 lines — that just wrap `supi-lsp/api` and `supi-tree-sitter/api`. Every action file duplicates the same acquisition + null-check + type-unpacking pattern. This makes actions tightly coupled to substrate internals and hard to test.

## Approach

Define consumer-side adapter interfaces in `supi-code-intelligence`, backed by concrete adapters that normalize substrate types. Share only the small value types (`CodePosition`, `CodeLocation`) in `supi-core` where other packages can reuse them. Actions receive adapters as parameters instead of importing providers.

No changes to `supi-lsp` or `supi-tree-sitter` — they already export clean services.

## New files

```
supi-core/src/
  substrate-types.ts          # CodePosition, CodeLocation

supi-code-intelligence/src/
  substrates/
    types.ts                   # SemanticSubstrate, StructuralSubstrate, value types
    lsp-adapter.ts             # createSemanticSubstrate(cwd)
    tree-sitter-adapter.ts     # createStructuralSubstrate(cwd)
```

## Deleted files

```
supi-code-intelligence/src/providers/
  semantic-provider.ts
  structural-provider.ts
```

## Files changed

- `supi-core/src/api.ts` / `supi-core/src/index.ts` — export `CodePosition`, `CodeLocation`
- `supi-code-intelligence/src/api.ts` / `src/index.ts` — export `SemanticSubstrate`, `StructuralSubstrate`, value types
- `tool/execute-brief.ts` — create substrates, pass to action
- `tool/execute-relations.ts` — create substrates, pass
- `tool/execute-affected.ts` — create substrates, pass
- `tool/execute-pattern.ts` — create substrates, pass (structured kind)
- `actions/callers-action.ts` — accept `SemanticSubstrate` param
- `actions/affected-action.ts` — accept `SemanticSubstrate` param
- `actions/implementations-action.ts` — accept `SemanticSubstrate` param
- `actions/callees-action.ts` — accept `StructuralSubstrate` param
- `actions/brief-action.ts` — accept `StructuralSubstrate` param
- `pattern-structured.ts` — accept `StructuralSubstrate` param
- `target-resolution.ts` — accept substrates params

## Interfaces

### supi-core: `substrate-types.ts`

- `CodePosition` — `{ line: number; character: number }` (0-based)
- `CodeLocation` — `{ uri: string; range: { start: CodePosition; end: CodePosition } }`

### supi-code-intelligence: `substrates/types.ts`

**Value types** (normalized flat structs):
- `StructuralResult<T>` — discriminated union mirroring TreeSitterResult
- `OutlineData`, `ExportData`, `ImportData`, `NodeAtData`, `CalleesData`
- `CodeSymbol` — normalized from LSP DocumentSymbol/SymbolInformation

**Interfaces**:
- `SemanticSubstrate` — `references`, `implementation`, `documentSymbols`, `workspaceSymbols`
- `StructuralSubstrate` — `calleesAt`, `exports`, `outline`, `imports`, `nodeAt`

### Concrete adapters

- `createSemanticSubstrate(cwd)` — wraps `getSessionLspService` + `waitForSessionLspService`, normalizes LSP types
- `createStructuralSubstrate(cwd)` — wraps `getSessionTreeSitterService` + fallback `createTreeSitterSession`, normalizes tree-sitter types

## Verification

- `pnpm vitest run packages/supi-code-intelligence/` — all existing tests pass
- `pnpm vitest run packages/supi-core/` — no regressions
- `pnpm exec biome check packages/supi-code-intelligence/ packages/supi-core/`
- `pnpm exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-core/tsconfig.json`

## Non-goals

- No changes to `supi-lsp` or `supi-tree-sitter`
- No unified `CodeSubstrate` interface
- No dynamic guidance composition
- No caching
