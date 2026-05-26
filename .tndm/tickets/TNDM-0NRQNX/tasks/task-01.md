# Task 1: Map exact consumers of each duplicate type and ProviderAvailability

## Goal

Audit every file that imports from or exports through the 11 duplicate types in `supi-code-intelligence/src/types.ts` plus `ProviderAvailability`. Produce a complete import/export map so the next tasks are surgical.

## Details

Run grep/structured search for each symbol across `packages/supi-code-intelligence/src/` and `packages/supi-code-intelligence/__tests__/`:

- `CodePosition`, `SourceRange`, `CodeLocation`, `CodeSymbol`
- `CodeResult`, `ConfidenceMode`
- `OutlineData`, `ExportData`, `ImportData`, `NodeAtData`, `CalleesData`
- `ProviderAvailability`

For each, determine:
1. Which files import it from `../types.ts` or `../../src/types.ts`
2. Which files re-export it through `api.ts` or `index.ts`
3. Whether the type is used in test mocks/fixtures

## Verification

- Output a markdown table or structured list of file → symbol → action (delete re-definition, update import, keep as-is)

