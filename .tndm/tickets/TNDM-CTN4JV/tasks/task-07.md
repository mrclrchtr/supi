# Task 7: Update target-resolution.ts to use substrates

`target-resolution.ts` uses both semantic and structural providers. Update to receive substrates as parameters.

- `resolveSymbolTarget()` — already accepts no substrate, calls `getSemanticServiceState` directly. Add optional `semantic: SemanticSubstrate` parameter. When provided, use it for `workspaceSymbols()` instead of going through the provider.
- `resolveFileTargetGroup()` — uses both providers. Add `semantic: SemanticSubstrate` and `structural: StructuralSubstrate` parameters.
- `resolveFileTargetsViaLsp()` — receives `semantic` instead of calling `getSemanticService`. Replace `lsp.documentSymbols()` with `semantic.documentSymbols()`. Results are already `CodeSymbol[]` — update `flattenDocumentSymbols` usages (may no longer need flattening since adapter normalizes).
- `resolveFileTargetsViaTreeSitter()` — receives `structural` instead of `withStructuralSession`. Replace `tsSession.exports()` with `structural.exports()`. Update type from `ExportRecord` to `ExportData`.
- Remove imports: `getSemanticService`, `getSemanticServiceState`, `withStructuralSession`

Update callers of these functions (in tool executors) to pass the substrates.

Update unit tests for target-resolution to mock substrates.

Run `pnpm vitest run packages/supi-code-intelligence/`.
