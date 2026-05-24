# Task 2: Migrate factual map and relations flows to use-case and renderer modules

## Goal
Move the `code_map` and `code_relations` logic out of the old action layer so factual inventory and callers/callees/implementations all follow the same typed use-case → markdown renderer pattern.

## Files
Create:
- `packages/supi-code-intelligence/src/use-case/generate-map.ts`
- `packages/supi-code-intelligence/src/use-case/generate-relations.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/map.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/relations.ts`
- `packages/supi-code-intelligence/src/use-case/support/semantic-references.ts`

Modify:
- `packages/supi-code-intelligence/src/tool/execute-map.ts`
- `packages/supi-code-intelligence/src/tool/execute-relations.ts`
- `packages/supi-code-intelligence/src/resolve-target.ts` only if imports must point at the new relation use-case flow
- `packages/supi-code-intelligence/__tests__/unit/map-action.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/callees-action.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts`

Delete after migration:
- `packages/supi-code-intelligence/src/actions/map-action.ts`
- `packages/supi-code-intelligence/src/actions/callers-action.ts`
- `packages/supi-code-intelligence/src/actions/callees-action.ts`
- `packages/supi-code-intelligence/src/actions/implementations-action.ts`
- `packages/supi-code-intelligence/src/actions/semantic-references.ts`

## Change
1. Start with failing tests for factual `code_map` output/details and for each `code_relations.kind` path.
2. Move reference aggregation helpers into `src/use-case/support/semantic-references.ts` so they no longer live under `src/actions/`.
3. Implement typed map and relations use-cases that return structured result objects and metadata inputs.
4. Implement dedicated map and relations markdown renderers that preserve current user-facing output conventions, including explicit unavailable states and structural vs semantic confidence.
5. Rewrite `executeMapTool()` and `executeRelationsTool()` into thin adapters that only validate, build substrates, call the use-case, render markdown, and return `CodeIntelResult`.
6. Remove the migrated `src/actions/*` files listed above once no imports remain.

## Verification
RED/GREEN focused checks during the task:
- `RTK_DISABLED=1 pnpm -v exec vitest run packages/supi-code-intelligence/__tests__/unit/map-action.test.ts packages/supi-code-intelligence/__tests__/unit/callees-action.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts`

Type/style checks for touched files:
- `RTK_DISABLED=1 pnpm -v exec biome check packages/supi-code-intelligence/src/tool/execute-map.ts packages/supi-code-intelligence/src/tool/execute-relations.ts packages/supi-code-intelligence/src/use-case packages/supi-code-intelligence/src/presentation/markdown packages/supi-code-intelligence/__tests__/unit/map-action.test.ts packages/supi-code-intelligence/__tests__/unit/callees-action.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts`
- `RTK_DISABLED=1 pnpm -v exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json`

