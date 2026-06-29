# Task 2: Phase 2: Introduce unified CodeProvider interface and registry in supi-code-intelligence

## Goal

Add a unified `CodeProvider` interface that combines SemanticProvider and StructuralProvider into a single contract. Add a `registerCodeProvider`/`getCodeProvider` registry keyed by session cwd. This is additive — nothing else changes yet.

## The CodeProvider interface

```ts
// packages/supi-code-intelligence/src/provider/code-provider.ts

export interface CodeProvider {
  // Semantic methods (LSP-backed)
  references(file: string, position: CodePosition): Promise<CodeLocation[] | null>;
  implementation(file: string, position: CodePosition): Promise<CodeLocation[] | null>;
  documentSymbols(file: string): Promise<CodeSymbol[] | null>;
  workspaceSymbols(query: string): Promise<CodeSymbol[] | null>;

  // Structural methods (tree-sitter-backed)
  calleesAt(file: string, line: number, character: number): Promise<CodeResult<CalleesData>>;
  exports(file: string): Promise<CodeResult<ExportData[]>>;
  outline(file: string): Promise<CodeResult<OutlineData[]>>;
  imports(file: string): Promise<CodeResult<ImportData[]>>;
  nodeAt(file: string, line: number, character: number): Promise<CodeResult<NodeAtData>>;
}
```

## Registry

```ts
// packages/supi-code-intelligence/src/provider/registry.ts

export type CodeProviderState =
  | { kind: "ready"; provider: CodeProvider }
  | { kind: "pending" }
  | { kind: "unavailable"; reason: string };

export function registerCodeProvider(cwd: string, provider: CodeProvider): void;
export function getCodeProvider(cwd: string): CodeProviderState;
export function clearCodeProvider(cwd: string): void;
```

Use `createSessionStateRegistry` from `@mrclrchtr/supi-core/session` for backing storage (same pattern as LSP and tree-sitter registries).

## Files to create

- `packages/supi-code-intelligence/src/provider/code-provider.ts` — CodeProvider interface
- `packages/supi-code-intelligence/src/provider/registry.ts` — registerCodeProvider / getCodeProvider / clearCodeProvider

## Files to modify

- `packages/supi-code-intelligence/src/api.ts` — export CodeProvider, CodeProviderState, registerCodeProvider, getCodeProvider, clearCodeProvider
- `packages/supi-code-intelligence/src/index.ts` — mirror api.ts

## Tests to create

- `packages/supi-code-intelligence/__tests__/unit/provider/registry.test.ts` — test register/get/clear lifecycle, cwd isolation, pending→ready transitions

## Verification

```bash
pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json
pnpm vitest run packages/supi-code-intelligence/__tests__/unit/provider/
pnpm exec biome check packages/supi-code-intelligence/src/provider/
```
