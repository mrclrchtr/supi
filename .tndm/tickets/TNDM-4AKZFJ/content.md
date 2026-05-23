# Implementation Plan: Shared Tool Framework in supi-core

## Overview

Add `src/tool-framework.ts` to supi-core containing:
- `SuiPiToolSpec` and `SuiPiToolPromptSurface` types
- `derivePromptSurface()` helper
- `registerSuiPiTools()` registration loop
- Shared TypeBox param builders (`FileParam`, `LineParam`, `CharacterParam`, `SymbolParam`, `MaxResultsParam`)

Export from `src/api.ts` and `src/index.ts`. No existing code changes.

## Files

| File | Action |
|---|---|
| `packages/supi-core/src/tool-framework.ts` | Create |
| `packages/supi-core/src/api.ts` | Add exports |
| `packages/supi-core/src/index.ts` | Add exports |
| `packages/supi-core/__tests__/unit/tool-framework.test.ts` | Create |

## Verification

- TypeScript compiles: `pnpm exec tsc --noEmit -p packages/supi-core/tsconfig.json`
- Tests pass: `pnpm vitest run packages/supi-core/`
- Biome clean: `pnpm exec biome check packages/supi-core/`
