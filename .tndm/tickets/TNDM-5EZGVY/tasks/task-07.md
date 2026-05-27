# Task 7: supi-insights: migrate to shared helpers (callWithJsonResponse, runWithProgressWidget)

## Goal
Replace duplicated LLM call patterns in supi-insights with `callWithJsonResponse` from `@mrclrchtr/supi-core/llm`, use `runWithProgressWidget` for long-running LLM phases, and remove local `withRetry`.

## Files
- **Modify:** `packages/supi-insights/src/generator.ts`
- **Modify:** `packages/supi-insights/src/extractor.ts`
- **Modify:** `packages/supi-insights/src/insights.ts`
- **Modify:** `packages/supi-insights/src/utils.ts` — remove `withRetry`
- **Modify:** `packages/supi-insights/package.json` — ensure supi-core dependency is present

## Changes

### generator.ts
Replace the 8 `INSIGHT_SECTIONS` LLM calls + `generateAtAGlance` with `callWithJsonResponse`. Each section becomes:

```ts
import { callWithJsonResponse } from "@mrclrchtr/supi-core/llm";
import { Type } from "@sinclair/typebox";

const ProjectAreasSchema = Type.Object({
  areas: Type.Array(Type.Object({
    name: Type.String(),
    sessionCount: Type.Number(),
    description: Type.String(),
  })),
});

// In generateSectionInsight:
const result = await callWithJsonResponse(ctx, {
  prompt: section.prompt,
  dataContext,
  schema: ProjectAreasSchema,
  maxTokens: section.maxTokens,
  retries: 2,
});
return { name: section.name, result: result?.parsed ?? null };
```

Define TypeBox schemas for each of the 8 insight section response shapes.

### extractor.ts
Replace the `complete()` + `withRetry` + JSON extraction pattern with `callWithJsonResponse`. Define a TypeBox schema for `SessionFacets`.

### insights.ts
Wrap the long-running LLM phases (facet extraction, insight generation) with `runWithProgressWidget`:

```ts
import { runWithProgressWidget } from "@mrclrchtr/supi-core/tool-framework";

// Phase 3: Facet extraction
await runWithProgressWidget(pi, ctx, "Extracting facets...", async (signal, onProgress) => {
  // ... existing facet extraction loop, call onProgress(current, total)
});

// Phase 5: Generate insights
await runWithProgressWidget(pi, ctx, "Generating insights...", async (signal, onProgress) => {
  // ... existing insight generation
});
```

### utils.ts
Remove the `withRetry` function. Check that no other code in supi-insights imports it (should only be generator.ts and extractor.ts, which we're migrating).

## TDD
Test-exempt for the migration itself (refactoring existing behavior). Verification through existing supi-insights tests plus manual integration test.

## Verification
- `pnpm vitest run packages/supi-insights/` — existing tests pass
- `pnpm exec tsc -b packages/supi-insights/tsconfig.json` passes
- `pnpm exec biome check packages/supi-insights/` passes
- Manual: run `/supi-insights` — report generates, working events fire, progress widget shows

