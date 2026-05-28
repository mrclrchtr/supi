# Task 1: Add hover to SemanticProvider interface (supi-code-runtime)

## Goal

Add an optional `hover` method to `SemanticProvider` in `packages/supi-code-runtime/src/capability/types.ts`.

## Change

Add to the `SemanticProvider` interface:

```ts
/**
 * Optional hover capability. Returns a simplified type/signature info
 * shape that does not depend on vscode-languageserver-types.
 */
hover?(filePath: string, position: CodePosition): Promise<{contents: string; range?: SourceRange} | null>;
```

This uses existing types (`CodePosition`, `SourceRange`) already in `src/types.ts`. No new imports needed beyond what's already there.

## Verification

- `pnpm exec tsc -b packages/supi-code-runtime/tsconfig.json` passes
- No downstream type errors in supi-lsp or supi-code-intelligence (yet — will break until task 2 is done, which is expected)

