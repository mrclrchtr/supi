# Task 2: Move model/planner/targeting into analysis services with explicit request context and model caching

## Goal
Replace hidden runtime lookups and overlapping targeting facades with one explicit analysis context, one cache-backed architecture-model service, and one canonical planner/targeting boundary under `src/analysis/` **without** replacing `@mrclrchtr/supi-code-runtime` as the shared capability broker.

## Files
- create `packages/supi-code-intelligence/src/analysis/context/request-context.ts`
- create `packages/supi-code-intelligence/src/analysis/architecture/model-service.ts`
- create `packages/supi-code-intelligence/src/analysis/architecture/model-cache.ts`
- create `packages/supi-code-intelligence/src/analysis/routing/planner.ts`
- create `packages/supi-code-intelligence/src/analysis/targeting/types.ts`
- create `packages/supi-code-intelligence/src/analysis/targeting/normalize-query.ts`
- create `packages/supi-code-intelligence/src/analysis/targeting/resolve-target.ts`
- create `packages/supi-code-intelligence/src/analysis/targeting/disambiguation.ts`
- update `packages/supi-code-intelligence/src/app/workspace-manager.ts`
- update `packages/supi-code-intelligence/src/app/workspace-session.ts`
- update `packages/supi-code-intelligence/src/model.ts`
- update `packages/supi-code-intelligence/src/resolve-target.ts`
- update `packages/supi-code-intelligence/src/target-resolution.ts`
- update `packages/supi-code-intelligence/src/planner/planner.ts`
- update or delete `packages/supi-code-intelligence/src/workspace/request-context.ts`
- add `packages/supi-code-intelligence/__tests__/unit/analysis/model-cache.test.ts`
- add `packages/supi-code-intelligence/__tests__/unit/analysis/resolve-target.test.ts`
- update `packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts`
- update `packages/supi-code-intelligence/__tests__/unit/target-resolution.test.ts`
- update `packages/supi-code-intelligence/__tests__/unit/request-context.test.ts`
- update `packages/supi-code-intelligence/__tests__/unit/workspace/request-context.test.ts`

## Change
1. **RED**: add `packages/supi-code-intelligence/__tests__/unit/analysis/model-cache.test.ts` to prove architecture models are reused within one workspace session and invalidated when the workspace manager signals a structural change.
2. **RED**: add `packages/supi-code-intelligence/__tests__/unit/analysis/resolve-target.test.ts` to prove the new `src/analysis/targeting/resolve-target.ts` handles anchored, file, symbol, and disambiguation cases through one canonical path.
3. Create `packages/supi-code-intelligence/src/analysis/context/request-context.ts` so deep analysis modules receive providers/model state explicitly instead of calling `getCodeProvider(cwd)` on their own. The builder should wrap the shared broker snapshot (for example through `supi-code-runtime` context helpers) plus workspace-session-local caches rather than introducing a second capability registry.
4. Move architecture-model construction into `packages/supi-code-intelligence/src/analysis/architecture/model-service.ts` and add `packages/supi-code-intelligence/src/analysis/architecture/model-cache.ts` so overview injection, brief generation, and affected analysis share one cacheable service.
5. Move planner logic into `packages/supi-code-intelligence/src/analysis/routing/planner.ts` and targeting logic into the new `src/analysis/targeting/*` files. The planner route shape should be explicit enough for `code_relations` to encode per-kind substrate choice and file-group allowance without re-deriving policy in tool executors.
6. Keep `packages/supi-code-intelligence/src/model.ts`, `packages/supi-code-intelligence/src/resolve-target.ts`, `packages/supi-code-intelligence/src/target-resolution.ts`, and `packages/supi-code-intelligence/src/planner/planner.ts` as thin compatibility shims that forward to the new analysis modules until all internal imports are migrated.
7. Remove the old deep-runtime ownership from `packages/supi-code-intelligence/src/workspace/request-context.ts`; if the path must stay exported temporarily, reduce it to a shim over the new explicit request-context builder / composite-provider helper and keep `@mrclrchtr/supi-code-runtime` as the canonical broker.

## Verification
- **RED then GREEN**: `RTK_DISABLED=1 pnpm vitest run -v packages/supi-code-intelligence/__tests__/unit/analysis/model-cache.test.ts packages/supi-code-intelligence/__tests__/unit/analysis/resolve-target.test.ts packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts packages/supi-code-intelligence/__tests__/unit/target-resolution.test.ts packages/supi-code-intelligence/__tests__/unit/request-context.test.ts packages/supi-code-intelligence/__tests__/unit/workspace/request-context.test.ts`
- **Typecheck**: `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`

## Test strategy
Test-driven. Watch the new model-cache and resolve-target tests fail before moving any logic into `src/analysis/`.
