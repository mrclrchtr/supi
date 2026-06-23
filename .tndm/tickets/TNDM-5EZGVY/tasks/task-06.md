# Task 6: supi-core: wire exports (llm subpath, api.ts re-export)

## Goal
Wire up the new supi-core exports: add the `llm` subpath export to `package.json`, re-export `llm.ts` from `api.ts`, and ensure the new module is accessible.

## Files
- **Modify:** `packages/supi-core/package.json` — add `"./llm"` to exports
- **Modify:** `packages/supi-core/src/api.ts` — add re-export of llm module

## Changes

**package.json exports:**
```json
"./llm": "./src/llm.ts"
```
Added to the existing exports map alongside config, context, debug, etc.

**api.ts:**
```ts
export * from "./llm.ts";
```

**Note:** `runWithProgressWidget` is added to `tool-framework.ts` and is already re-exported via `api.ts`'s existing `export * from "./tool-framework.ts"`. `loadSectionConfig` is added to `config/config.ts` and is already re-exported via `export * from "./config.ts"` in api.ts. So only the new `llm.ts` needs explicit wiring.

## TDD
Test-exempt — pure wiring with no logic. Verified by Tasks 7 and 8 which import from the new paths.

## Verification
- `pnpm exec tsc -b packages/supi-core/tsconfig.json` passes
- `node -e "require('./packages/supi-core/package.json').exports['./llm']"` confirms the export exists
