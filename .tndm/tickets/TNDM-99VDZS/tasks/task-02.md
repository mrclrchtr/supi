# Task 2: Implement hover in LSP SemanticProvider adapter (supi-lsp)

## Goal

Implement the `hover` method in `createLspSemanticProvider` in `packages/supi-lsp/src/provider/lsp-semantic-provider.ts`.

## Change

Add a `hover` method to the returned object that:

1. Calls `lsp.hover(filePath, position)` on the `SessionLspService`
2. Converts the LSP `Hover` result into the simplified runtime shape `{contents: string; range?: SourceRange}`:
   - Extract text from `MarkupContent.value`, `MarkedString[]`, or plain `string`
   - Convert optional LSP `range` to `SourceRange` if present
3. Returns `null` when LSP has no hover result

The conversion helper should be a local function — no need to export it.

## Verification
- `pnpm exec tsc -b packages/supi-lsp/tsconfig.json` passes
- `pnpm vitest run packages/supi-lsp/` passes (existing tests + optional new unit test for hover conversion)

