# Task 3: Phase 3: Create CodeProvider implementations in supi-lsp and supi-tree-sitter, register at session_start

## Goal

Create `CodeProvider` implementations in `supi-lsp` and `supi-tree-sitter` that wrap their existing services, and register them into the unified registry at `session_start`.

## Files to create

### supi-lsp
- `packages/supi-lsp/src/provider/lsp-code-provider.ts` — adapts `SessionLspService` into `CodeProvider`:
  ```ts
  import type { CodeProvider } from "@mrclrchtr/supi-code-intelligence/api";
  import type { SessionLspService } from "../session/service-registry.ts";
  import { createLspSemanticProvider } from "./lsp-semantic-provider.ts";

  export function createLspCodeProvider(lsp: SessionLspService): CodeProvider {
    const semantic = createLspSemanticProvider(lsp);
    return {
      references: semantic.references,
      implementation: semantic.implementation,
      documentSymbols: semantic.documentSymbols,
      workspaceSymbols: semantic.workspaceSymbols,
      // Structural methods: return unsupported-language result
      calleesAt: async (file, line, character) => ({
        kind: "unsupported-language" as const,
        file,
        message: "Callees require tree-sitter (structural analysis). Use tree_sitter_callees.",
      }),
      exports: async (file) => ({
        kind: "unsupported-language" as const,
        file,
        message: "Exports require tree-sitter (structural analysis). Use tree_sitter_exports.",
      }),
      outline: async (file) => ({
        kind: "unsupported-language" as const,
        file,
        message: "Outline requires tree-sitter (structural analysis). Use tree_sitter_outline.",
      }),
      imports: async (file) => ({
        kind: "unsupported-language" as const,
        file,
        message: "Imports require tree-sitter (structural analysis). Use tree_sitter_imports.",
      }),
      nodeAt: async (file, line, character) => ({
        kind: "unsupported-language" as const,
        file,
        message: "node_at requires tree-sitter (structural analysis). Use tree_sitter_node_at.",
      }),
    };
  }
  ```

### supi-tree-sitter
- `packages/supi-tree-sitter/src/provider/tree-sitter-code-provider.ts` — adapts `TreeSitterService` into `CodeProvider`:
  ```ts
  import type { CodeProvider } from "@mrclrchtr/supi-code-intelligence/api";
  import type { TreeSitterService } from "../types.ts";
  import { createTreeSitterProvider } from "./tree-sitter-provider.ts";

  export function createTreeSitterCodeProvider(service: TreeSitterService): CodeProvider {
    const structural = createTreeSitterProvider(service);
    return {
      // Semantic methods: return null (unavailable through tree-sitter)
      references: async () => null,
      implementation: async () => null,
      documentSymbols: async () => null,
      workspaceSymbols: async () => null,
      // Structural methods
      calleesAt: structural.calleesAt,
      exports: structural.exports,
      outline: structural.outline,
      imports: structural.imports,
      nodeAt: structural.nodeAt,
    };
  }
  ```

## Files to modify

### supi-lsp
- `packages/supi-lsp/src/lsp.ts` — import `registerCodeProvider` from `@mrclrchtr/supi-code-intelligence/api` and `createLspCodeProvider`. In the `session_start` handler (after server init completes), register the provider.
  - **Important**: LSP uses `createRuntimeState()` which stores `state.manager`. The registration must happen after `startDetectedServers` resolves (inside the `session-lifecycle.ts` handler or via a new hook). Check `handlers/session-lifecycle.ts` for the exact registration point.
- `packages/supi-lsp/src/session/service-registry.ts` — keep existing `SessionLspService` registry unchanged (it's still needed for direct `lsp_*` tool access and diagnostics).

### supi-tree-sitter
- `packages/supi-tree-sitter/src/tree-sitter.ts` — import `registerCodeProvider` and register at `session_start` after creating the runtime.
- `packages/supi-tree-sitter/src/session/service-registry.ts` — keep existing registry unchanged.

### Package dependencies
- `packages/supi-lsp/package.json` — add `@mrclrchtr/supi-code-intelligence` to dependencies and bundledDependencies
- `packages/supi-tree-sitter/package.json` — add `@mrclrchtr/supi-code-intelligence` to dependencies and bundledDependencies

## Key constraint

The `CodeProvider` interface lives in `supi-code-intelligence`. This means `supi-lsp` and `supi-tree-sitter` now depend on `supi-code-intelligence`. This inverts the current dependency direction (currently code-intelligence depends on LSP + tree-sitter). After Phase 4, code-intelligence will no longer depend on LSP or tree-sitter — completing the flip.

## Verification

```bash
# Typecheck
pnpm exec tsc -b packages/supi-lsp/tsconfig.json
pnpm exec tsc -b packages/supi-tree-sitter/tsconfig.json
pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json

# Unit tests for provider registration
pnpm vitest run packages/supi-lsp/__tests__/unit/
pnpm vitest run packages/supi-tree-sitter/__tests__/unit/

# Biome
pnpm exec biome check packages/supi-lsp/src/provider/lsp-code-provider.ts packages/supi-tree-sitter/src/provider/tree-sitter-code-provider.ts

# Pack verification (circular dep check)
node scripts/publish.mjs packages/supi-code-intelligence
node scripts/publish.mjs packages/supi-lsp
node scripts/publish.mjs packages/supi-tree-sitter
```

