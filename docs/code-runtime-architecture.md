# Code-Runtime Architecture

## Purpose

`packages/supi-code-runtime/` is the shared substrate layer that owns the canonical
code-understanding model — types, workspace session, provider contracts, and
project-model cache — that the other code-intelligence packages target.

## Layering

```
supi-code-runtime  ← shared contracts, types, session, project model
    ↑         ↑
    │         └──── supi-code-intelligence  ← orchestration, presentation, code_* tools
    │
    ├── supi-tree-sitter  ← structural provider (tree_sitter_* tools)
    └── supi-lsp          ← semantic provider (lsp_* tools)
```

- `supi-code-runtime` has **no pi tool surface** — it is a library-only package.
- `supi-tree-sitter` and `supi-lsp` depend on it for their provider contracts.
- `supi-code-intelligence` depends on it for the workspace session and project model.

## Package responsibilities

### `packages/supi-code-runtime/`

Owns:
- Canonical shared types: `Position`, `Range`, `Location`, `Symbol`, `Target`,
  `TargetGroup`, `Diagnostic`, `CodeResult`, `ConfidenceMode`,
  `ProviderAvailability` (pending / ready / disabled / inactive / unavailable)
- Provider contract interfaces: `SemanticProvider`, `StructuralProvider`
- Workspace-scoped session/context primitives
- Shared workspace-scoped service registry
- Project-model building and caching (multi-language workspace detection)

### `packages/supi-tree-sitter/`

Owns:
- Grammar/runtime lifecycle (WASM parser management)
- Structural provider implementation
- `tree_sitter_*` tool registration and result formatting
- Structural analyzers: `outline`, `imports`, `exports`, `node_at`, `callees`

### `packages/supi-lsp/`

Owns:
- LSP transport/client pool lifecycle
- Workspace root routing and server startup
- Diagnostics collection and recovery subsystems
- Semantic provider implementation
- `lsp_*` tool registration and result formatting

### `packages/supi-code-intelligence/`

Owns:
- Target resolution
- Use-case orchestration (`code_brief`, `code_map`, `code_relations`,
  `code_affected`, `code_pattern`)
- Prioritization and ranking signals
- Markdown rendering
- `code_*` tool registration and cross-family guidance

## Provider interfaces

### SemanticProvider

```ts
interface SemanticProvider {
  references(filePath: string, position: Position): Promise<CodeLocation[] | null>;
  implementation(filePath: string, position: Position): Promise<CodeLocation[] | null>;
  documentSymbols(filePath: string): Promise<CodeSymbol[] | null>;
  workspaceSymbols(query: string): Promise<CodeSymbol[] | null>;
}
```

### StructuralProvider

```ts
interface StructuralProvider {
  calleesAt(file: string, line: number, character: number): Promise<CodeResult<CalleesData>>;
  exports(file: string): Promise<CodeResult<ExportData[]>>;
  outline(file: string): Promise<CodeResult<OutlineData[]>>;
  imports(file: string): Promise<CodeResult<ImportData[]>>;
  nodeAt(file: string, line: number, character: number): Promise<CodeResult<NodeAtData>>;
}
```

## Compatibility rules

- Preserve all current `lsp_*`, `tree_sitter_*`, and `code_*` tool contracts.
- Preserve the standalone-correct behavior of `supi-tree-sitter` and `supi-lsp`
  when installed without `supi-code-intelligence`.
- Additive migrations only: new provider contracts appear alongside old APIs;
  old APIs are removed only after callers have migrated.
- Use compatibility wrappers for the `supi-code-intelligence` targeting and
  substrate layers until the final cleanup phase.

## Migration order

1. Scaffold `packages/supi-code-runtime/` with compilable structure.
2. Implement shared canonical types, provider contracts, session helpers.
3. Migrate `supi-tree-sitter` to expose a provider through the shared contracts.
4. Split `supi-lsp` manager and expose a provider through the shared contracts.
5. Extract project-model ownership into the runtime package.
6. Refactor `supi-code-intelligence` to consume shared context.
7. Update docs and packaging verification.
