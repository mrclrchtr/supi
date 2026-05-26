# Task 2: Delete duplicate types from code-intelligence/types.ts, re-import from code-runtime

## Goal

Remove the 11 redefined canonical types from `supi-code-intelligence/src/types.ts` and replace with re-exports from `@mrclrchtr/supi-code-runtime/api`. Update all consumers.

## Details

### Step 1 — In types.ts:
- Delete: `CodePosition`, `SourceRange`, `CodeLocation`, `CodeSymbol`
- Delete: `CodeResult<T>`, `ConfidenceMode`
- Delete: `OutlineData`, `ExportData`, `ImportData`, `NodeAtData`, `CalleesData`
- Delete: `ProviderAvailability`
- Keep: `BriefDetails`, `MapDetails`, `SearchDetails`, `AffectedDetails`, `DisambiguationCandidate`, `CodeIntelResult` (these are code-intelligence-specific)
- Add import equivalents from `@mrclrchtr/supi-code-runtime/api`:
  ```ts
  import type { CapabilityState, CodeLocation, CodePosition, CodeResult, CodeSymbol, ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
  ```
  Then re-export as needed.

Note: `SourceRange` is used by `types.ts`'s own `AffectedDetails`? Check — if not needed by remaining types, don't re-export.

### Step 2 — Update consumers:
- `src/api.ts` — remove direct exports of deleted types; replace `ProviderAvailability` with `CapabilityState`
- `src/index.ts` — same
- `src/brief.ts` — update imports from `./types.ts` to `@mrclrchtr/supi-code-runtime/api` for any deleted types
- `src/brief-focused.ts` — same
- `src/prioritization-signals.ts` — check imports

### Step 3 — Update test imports:
- `__tests__/unit/target-resolution.test.ts` — if it imports from `../../src/substrates/types.ts`, update to import from `@mrclrchtr/supi-code-runtime/api`

## Verification

- `pnpm exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json` passes
- `pnpm exec tsc --noEmit -p packages/supi-code-intelligence/__tests__/tsconfig.json` passes
- No residual `from "../types.ts"` imports of the deleted symbols remain in src/

