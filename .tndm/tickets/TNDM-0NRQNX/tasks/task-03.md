# Task 3: Delete substrates/types.ts, inline remaining aliases

## Goal

Delete `packages/supi-code-intelligence/src/substrates/types.ts` and inline the two type aliases (`SemanticSubstrate = SemanticProvider`, `StructuralSubstrate = StructuralProvider`) directly where they're consumed.

## Details

### Step 1 — Find all consumers of substrates/types.ts:
Files that import from `../substrates/types.ts` or `./substrates/types.ts`:
- `src/targeting/types.ts` — imports `SemanticSubstrate`, `StructuralSubstrate`
- `src/targeting/resolve-file.ts` — imports `SemanticSubstrate`, `StructuralSubstrate`
- `src/targeting/resolve-symbol.ts` — imports `SemanticSubstrate`
- `src/api.ts` — exports `SemanticSubstrate`, `StructuralSubstrate`
- `src/index.ts` — same

### Step 2 — In each consumer, replace:
```ts
import type { SemanticSubstrate, StructuralSubstrate } from "../substrates/types.ts";
```
with:
```ts
import type { SemanticProvider, StructuralProvider } from "@mrclrchtr/supi-code-runtime/api";
```
Then use `SemanticProvider`/`StructuralProvider` directly instead of the aliases. OR add local type aliases if renaming across many files is too noisy.

### Step 3 — Update api.ts/index.ts:
```ts
// Before
export type { SemanticSubstrate, StructuralSubstrate } from "./substrates/types.ts";
// After
export type { SemanticProvider, StructuralProvider } from "@mrclrchtr/supi-code-runtime/api";
```
Remove `SemanticSubstrate`/`StructuralSubstrate` from the public API surface (these were just aliases anyway).

### Step 4 — Delete:
```bash
rm packages/supi-code-intelligence/src/substrates/types.ts
```

## Verification

- No remaining imports from `substrates/types.ts` anywhere
- `pnpm exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json` passes
- `pnpm exec tsc --noEmit -p packages/supi-code-intelligence/__tests__/tsconfig.json` passes

