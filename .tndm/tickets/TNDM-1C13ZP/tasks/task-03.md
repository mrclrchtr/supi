# Task 3: code_impact: evidence annotation for changedFiles and test provenance

## Goal
Add evidence annotation to `code_impact` changedFiles output and wire test provenance through the impact pipeline.

## Files
- `packages/supi-code-intelligence/src/tool/execute-impact.ts`
- `packages/supi-code-intelligence/src/use-case/generate-impact.ts`

## Changes

### `generate-impact.ts`

1. **`analyzeChangedFiles` function** (~L417): Add a `testProvenance` field to the returned `ImpactAnalysis`:
   ```ts
   testProvenance: includeTests
     ? (references ? "semantic+conventions" as const : "conventions-only" as const)
     : undefined
   ```

2. **`collectLikelyTests` function** (~L509): Adapt to new `discoverTestFilesForSource` return type:
   ```ts
   const { files: discovered } = await discoverTestFilesForSource(affFile, { ... });
   for (const testFile of discovered) { ... }
   ```

3. **`executeChangedFilesImpact` function** (~L308): After `renderChangedFilesImpact(...)`, prepend the evidence note:
   ```
   **Evidence: structural** — impact limited to file-level module analysis
   and path-based test discovery. Use `code_resolve` for semantic impact.
   ```

4. **Import `TestDiscoveryProvenance`** from tests.ts (type-only).

5. **Impact renderer** (`src/presentation/markdown/impact.ts` or inline in `renderChangedFilesImpact`): When `analysis.testProvenance === "conventions-only"` and `analysis.likelyTests.length > 0`, annotate the test list heading with "Tests (conventions-only — no LSP/TS)".

### `execute-impact.ts`

No changes needed — the evidence note is added entirely within `generate-impact.ts`. The `executeImpactLikeTool` function already delegates to `executeImpact`.

## Verification
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json` passes
- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts` — existing tests pass (Task 5 adds new assertions)
- Manual: calling `code_impact` with `changedFiles` and `includeTests:true` renders the evidence note and test provenance annotation
