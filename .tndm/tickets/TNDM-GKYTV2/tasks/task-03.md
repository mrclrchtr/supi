# Task 3: Refactor code_* orchestration into typed analysis services plus thin render adapters

## Goal
Make the `code_*` domain logic live under `src/analysis/` as typed services, with markdown rendering kept in `src/presentation/markdown/`, public result metadata updated to match the new typed domain outputs, and the tool executors reduced to validate → build context → call service → render.

## Files
- create `packages/supi-code-intelligence/src/analysis/brief/service.ts`
- create `packages/supi-code-intelligence/src/analysis/map/service.ts`
- create `packages/supi-code-intelligence/src/analysis/relations/types.ts`
- create `packages/supi-code-intelligence/src/analysis/relations/service.ts`
- create `packages/supi-code-intelligence/src/analysis/relations/callers.ts`
- create `packages/supi-code-intelligence/src/analysis/relations/implementations.ts`
- create `packages/supi-code-intelligence/src/analysis/relations/callees.ts`
- create `packages/supi-code-intelligence/src/analysis/affected/service.ts`
- create `packages/supi-code-intelligence/src/analysis/pattern/service.ts`
- create `packages/supi-code-intelligence/src/analysis/refactor/service.ts`
- create `packages/supi-code-intelligence/src/analysis/refactor/safety.ts`
- create `packages/supi-code-intelligence/src/analysis/refactor/apply-workspace-edit.ts`
- update `packages/supi-code-intelligence/src/api.ts`
- update `packages/supi-code-intelligence/src/index.ts`
- update `packages/supi-code-intelligence/src/types.ts`
- update `packages/supi-code-intelligence/src/brief.ts`
- update `packages/supi-code-intelligence/src/brief-focused.ts`
- update `packages/supi-code-intelligence/src/use-case/build-overview.ts`
- update `packages/supi-code-intelligence/src/use-case/generate-brief.ts`
- update `packages/supi-code-intelligence/src/use-case/generate-map.ts`
- update `packages/supi-code-intelligence/src/use-case/generate-relations.ts`
- update `packages/supi-code-intelligence/src/use-case/generate-affected.ts`
- update `packages/supi-code-intelligence/src/use-case/generate-pattern.ts`
- update `packages/supi-code-intelligence/src/use-case/types.ts`
- update `packages/supi-code-intelligence/src/refactor/safety.ts`
- update `packages/supi-code-intelligence/src/refactor/apply-workspace-edit.ts`
- update `packages/supi-code-intelligence/src/presentation/markdown/brief.ts`
- update `packages/supi-code-intelligence/src/presentation/markdown/map.ts`
- update `packages/supi-code-intelligence/src/presentation/markdown/relations.ts`
- update `packages/supi-code-intelligence/src/presentation/markdown/affected.ts`
- update `packages/supi-code-intelligence/src/presentation/markdown/pattern.ts`
- update `packages/supi-code-intelligence/src/presentation/markdown/refactor.ts`
- update `packages/supi-code-intelligence/src/tool/execute-brief.ts`
- update `packages/supi-code-intelligence/src/tool/execute-map.ts`
- update `packages/supi-code-intelligence/src/tool/execute-relations.ts`
- update `packages/supi-code-intelligence/src/tool/execute-affected.ts`
- update `packages/supi-code-intelligence/src/tool/execute-pattern.ts`
- update `packages/supi-code-intelligence/src/tool/execute-refactor.ts`
- add `packages/supi-code-intelligence/__tests__/unit/analysis/brief-service.test.ts`
- add `packages/supi-code-intelligence/__tests__/unit/analysis/relations-service.test.ts`
- add `packages/supi-code-intelligence/__tests__/unit/presentation/relations-render.test.ts`
- add `packages/supi-code-intelligence/__tests__/unit/analysis/affected-service.test.ts`
- update `packages/supi-code-intelligence/__tests__/unit/brief.test.ts`
- update `packages/supi-code-intelligence/__tests__/unit/map-action.test.ts`
- update `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts`
- update `packages/supi-code-intelligence/__tests__/unit/refactor-tool.test.ts`
- update `packages/supi-code-intelligence/__tests__/unit/semantic-references.test.ts`

## Change
1. **RED**: add service-level tests for brief, relations, and affected flows under `packages/supi-code-intelligence/__tests__/unit/analysis/` so the new analysis layer is proven without relying on tool registration.
2. Create the new `packages/supi-code-intelligence/src/analysis/*/service.ts` modules and move domain decisions out of the current mixed `use-case/`, root helper, and tool-executor files. For `code_relations`, split the logic into `types.ts`, `service.ts`, `callers.ts`, `implementations.ts`, and `callees.ts` so the dispatcher stays thin and each relation kind owns its own substrate-specific behavior.
3. Keep `packages/supi-code-intelligence/src/presentation/markdown/*.ts` responsible for markdown output only; the new analysis services should return typed data/details, not `lines.push(...)` orchestration coupled to tool text. `packages/supi-code-intelligence/src/presentation/markdown/relations.ts` should render from typed `RelationsResult` data and include an explicit note when caller results use semantic references as caller evidence.
4. Update the current `packages/supi-code-intelligence/src/tool/execute-*.ts` files to become temporary thin adapters over the new services; these files can stay as forwarders until the tool-family reorganization in the next task. `code_relations` should expose explicit relation metadata such as confidence, omitted counts, and caller evidence (`"semantic-references"` vs `"verified-call-sites"`) from the analysis layer rather than inventing those details in the renderer.
5. Update `packages/supi-code-intelligence/src/types.ts` and the public package surfaces in `packages/supi-code-intelligence/src/api.ts` / `packages/supi-code-intelligence/src/index.ts` so relation-specific evidence metadata is represented explicitly instead of being squeezed into generic search details.
6. Reduce the current `packages/supi-code-intelligence/src/use-case/generate-*.ts`, `packages/supi-code-intelligence/src/use-case/types.ts`, and `packages/supi-code-intelligence/src/refactor/*` modules to compatibility forwarders or delete them once callers have migrated to the new analysis-layer ownership.
7. Keep `packages/supi-code-intelligence/src/brief.ts` and `packages/supi-code-intelligence/src/brief-focused.ts` as compatibility shims or narrowly-scoped helpers only where they still support the public `/api` surface.

## Verification
- **RED then GREEN**: `RTK_DISABLED=1 pnpm vitest run -v packages/supi-code-intelligence/__tests__/unit/analysis/brief-service.test.ts packages/supi-code-intelligence/__tests__/unit/analysis/relations-service.test.ts packages/supi-code-intelligence/__tests__/unit/analysis/affected-service.test.ts packages/supi-code-intelligence/__tests__/unit/presentation/relations-render.test.ts packages/supi-code-intelligence/__tests__/unit/brief.test.ts packages/supi-code-intelligence/__tests__/unit/map-action.test.ts packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts packages/supi-code-intelligence/__tests__/unit/refactor-tool.test.ts packages/supi-code-intelligence/__tests__/unit/semantic-references.test.ts`
- **Typecheck**: `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`

## Test strategy
Test-driven. Watch the new `__tests__/unit/analysis/*` cases fail before moving any `code_*` orchestration into the new service modules.
