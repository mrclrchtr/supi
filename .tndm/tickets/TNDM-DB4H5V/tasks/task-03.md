# Task 3: Refactor affected analysis into a typed impact use-case and dedicated renderer

## Goal
Separate impact analysis from markdown formatting so `code_affected` computes structured blast-radius data in the use-case layer and renders it only at the presentation edge.

## Files
Create:
- `packages/supi-code-intelligence/src/use-case/generate-affected.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/affected.ts`

Modify:
- `packages/supi-code-intelligence/src/tool/execute-affected.ts`
- `packages/supi-code-intelligence/src/prioritization-signals.ts` only if import shapes or helper boundaries need minor adjustment
- `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/semantic-file-target.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/review-fixes.test.ts` if output wording assertions depend on the renderer split

Delete after migration:
- `packages/supi-code-intelligence/src/actions/affected-action.ts`

## Change
1. Add failing tests first for:
   - unavailable vs semantic confidence in affected results
   - file-level affected output/details
   - preservation of explicit `AffectedDetails` metadata
2. Implement a typed affected use-case that performs target resolution, reference collection, module/downstream analysis, likely test detection, and priority-signal collection without building markdown strings.
3. Move all affected markdown formatting into `src/presentation/markdown/affected.ts`.
4. Update `executeAffectedTool()` to become a thin adapter over validation, semantic substrate creation, use-case execution, and rendering.
5. Delete `src/actions/affected-action.ts` once the new use-case owns the behavior.

## Verification
RED/GREEN focused checks during the task:
- `RTK_DISABLED=1 pnpm -v exec vitest run packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts packages/supi-code-intelligence/__tests__/unit/semantic-file-target.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts packages/supi-code-intelligence/__tests__/unit/review-fixes.test.ts`

Type/style checks for touched files:
- `RTK_DISABLED=1 pnpm -v exec biome check packages/supi-code-intelligence/src/tool/execute-affected.ts packages/supi-code-intelligence/src/use-case packages/supi-code-intelligence/src/presentation/markdown packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts packages/supi-code-intelligence/__tests__/unit/semantic-file-target.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts packages/supi-code-intelligence/__tests__/unit/review-fixes.test.ts`
- `RTK_DISABLED=1 pnpm -v exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json`

