# Redesign the code-intelligence stack architecture

## Goal

Restructure the four-package code-understanding stack (`supi-code-runtime`, `supi-lsp`, `supi-tree-sitter`, `supi-code-intelligence`) to eliminate unnecessary abstraction layers, simplify the provider contract model, and flip dependency direction so substrate packages depend on the hub rather than the other way around.

## Current architecture problems

1. **`supi-code-runtime` is an unnecessary package** — it only exists to hold provider contracts and shared types consumed by the other three packages. It has no independent reason to exist and will never gain one. Merge it into `supi-code-intelligence`.

2. **Provider contracts are too narrow** — `SemanticProvider` has only 4 methods (references, implementation, documentSymbols, workspaceSymbols), but consumers need hover, definition, diagnostics, rename, code actions. They bypass the contract and talk directly to `SessionLspService`. This leaks the abstraction.

3. **Dependency direction is backwards** — code-intelligence depends on LSP and tree-sitter, then wraps them through substrate adapters. Instead, LSP and tree-sitter should depend on code-intelligence for the `CodeProvider` contract and register themselves into a unified registry.

4. **Substrate adapters add indirection without value** — `substrates/lsp-adapter.ts` and `substrates/tree-sitter-adapter.ts` dynamically import adapters in every use-case function. `SemanticSubstrate` is a type alias for `SemanticProvider` (cosmetic renaming). Eliminate the adapter layer entirely.

5. **Dynamic `import()` in every use-case** — `generate-relations.ts`, `generate-brief.ts`, `generate-affected.ts` each independently do `await import("../substrates/lsp-adapter.ts")`. This hides the dependency graph and adds async overhead. Replace with explicit DI.

6. **`WorkspaceContext` is dead code** — exported from `supi-code-runtime` but nothing uses it. Remove.

7. **`ArchitectureModel` lives in the wrong package** — it's in `supi-code-runtime` but only code-intelligence consumes it. Move it there.

8. **Three-layer targeting pipeline** — `resolve-target.ts` → `target-resolution.ts` (compat facade) → `targeting/*.ts`. Collapse to one module.

9. **Un-unified tool details types** — `BriefDetails`, `MapDetails`, `SearchDetails` share common fields but don't share a base type.

10. **Tool guidance is maintained separately from tool specs** — duplicate maintenance burden.

## Target architecture

```
supi-code-intelligence/          (hub — owns contracts, model, tools, rendering)
├── src/
│   ├── provider/
│   │   ├── types.ts           # CodeProvider interface (unified semantic+structural)
│   │   └── registry.ts        # registerCodeProvider / getCodeProvider (cwd-keyed)
│   ├── model.ts               # ArchitectureModel + buildArchitectureModel (moved from runtime)
│   ├── types.ts               # Canonical types: CodeResult<T>, CodePosition, CodeLocation, etc.
│   ├── tool/
│   │   ├── specs.ts           # single source of truth — schemas + auto-derived guidance
│   │   ├── register-tools.ts  # tool registration (code_* + lsp_* + tree_sitter_*)
│   │   ├── brief.ts           # validate → resolve target → get provider → execute → render
│   │   ├── map.ts
│   │   ├── relations.ts
│   │   ├── affected.ts
│   │   └── pattern.ts
│   ├── rendering/
│   │   ├── brief.ts
│   │   ├── map.ts
│   │   ├── relations.ts
│   │   ├── affected.ts
│   │   └── pattern.ts
│   ├── target-resolution.ts   # collapsed single-module resolution pipeline
│   ├── search-helpers.ts      # ripgrep, path normalization (keep)
│   ├── prioritization-signals.ts
│   ├── git-context.ts
│   └── code-intelligence.ts   # extension entry: overview injection + tool reg
│
supi-lsp/                        (library + pi extension for low-level lsp_* tools)
├── src/
│   ├── provider/
│   │   └── lsp-code-provider.ts  # implements CodeProvider (was lsp-semantic-provider.ts)
│   ├── session/
│   │   ├── service-registry.ts   # keeps SessionLspService + registry for direct access
│   │   └── lsp-state.ts
│   ├── client/                   # slimmed: client.ts, transport.ts (merge manager/ into ~5 files)
│   ├── tool/                     # low-level lsp_* tools (keep for expert use)
│   ├── config/
│   ├── diagnostics/
│   ├── handlers/
│   ├── ui/
│   └── lsp.ts                   # extension entry — registers LspCodeProvider + lsp_* tools
│
supi-tree-sitter/                (library + pi extension for low-level tree_sitter_* tools)
├── src/
│   ├── provider/
│   │   └── tree-sitter-code-provider.ts  # implements CodeProvider (was tree-sitter-provider.ts)
│   ├── session/
│   ├── tool/                     # low-level tree_sitter_* tools (keep for expert use)
│   └── tree-sitter.ts           # extension entry — registers TreeSitterCodeProvider + tools
│
supi-code-runtime/ → DELETE       (merged into supi-code-intelligence)
```

## Locked decisions

- **Phased migration**: 6 independent phases, each shippable and testable on its own.
- **Backward compatibility**: Phase 1 keeps `supi-code-runtime` re-exporting from code-intelligence so existing imports don't break. The `supi-code-runtime` package is removed only in Phase 6.
- **No tool name changes**: `lsp_*`, `tree_sitter_*`, and `code_*` tool names stay identical.
- **No change to LSP/TS low-level tool surface**: The expert `lsp_*` and `tree_sitter_*` tools remain registered by their respective extensions (not code-intelligence). TNDM-ACNZFE consolidated the install surface; this redesign does not undo that.
- **Library APIs remain stable**: `@mrclrchtr/supi-lsp/api` and `@mrclrchtr/supi-tree-sitter/api` keep their existing exports.
- **Package boundaries**: LSP and tree-sitter remain separate publishable packages. Only type contracts and the model move.

## Non-goals

- Do not rename packages.
- Do not change WASM vendoring or grammar strategy.
- Do not change the overview injection mechanism.
- Do not change the diagnostic renderer or tool override behavior.
- Do not change session lifecycle semantics.
- Do not modify `supi-core` itself.

## Phases

### Phase 1: Merge types + contracts into code-intelligence (re-export for back-compat)
Move canonical types and provider contracts from `supi-code-runtime/src/` into `supi-code-intelligence/src/types.ts` and `supi-code-intelligence/src/provider/types.ts`. Update `supi-code-runtime` to re-export from code-intelligence. All existing imports continue working.

### Phase 2: Introduce `CodeProvider` interface and unified registry
Add the unified `CodeProvider` interface to code-intelligence's provider module. Add `registerCodeProvider`/`getCodeProvider` registry. This is additive — existing code is untouched.

### Phase 3: Register providers from LSP and tree-sitter at session_start
In `supi-lsp` and `supi-tree-sitter` extension entries, register `LspCodeProvider` and `TreeSitterCodeProvider` implementations into the unified registry at `session_start`. The existing `SessionLspService` and `TreeSitterService` registries continue working in parallel.

### Phase 4: Migrate code-intelligence use-cases to unified provider
Replace dynamic `import("../substrates/*-adapter.ts")` calls in `generate-brief.ts`, `generate-relations.ts`, `generate-affected.ts`, `generate-pattern.ts` with `getCodeProvider(cwd)` via explicit DI. Delete `substrates/lsp-adapter.ts` and `substrates/tree-sitter-adapter.ts`.

### Phase 5: Cleanup — collapse targeting, remove WorkspaceContext, move ArchitectureModel, unify details
Collapse the 3-layer targeting pipeline into one module. Remove `WorkspaceContext`. Move `ArchitectureModel` from runtime into code-intelligence. Introduce shared `CodeIntelDetails` base type. Generate tool guidance from specs.

### Phase 6: Delete supi-code-runtime package, finalize
Remove the `supi-code-runtime` package entirely. Update all imports to point to `@mrclrchtr/supi-code-intelligence/api`. Update manifests, test configs, and publish pipeline.
