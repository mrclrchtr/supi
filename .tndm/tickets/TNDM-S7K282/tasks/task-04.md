# Task 4: Refactor `packages/supi-code-intelligence/` to consume shared workspace runtime instead of owning a provider registry

## Goal
Make `supi-code-intelligence` a pure orchestration/UX layer that consumes semantic and structural capability state from `@mrclrchtr/supi-code-runtime` instead of owning `CodeProvider` contracts, registry composition, or startup wiring.

## Files
Modify:
- `packages/supi-code-intelligence/package.json`
- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`
- `packages/supi-code-intelligence/src/api.ts`
- `packages/supi-code-intelligence/src/index.ts`
- `packages/supi-code-intelligence/src/code-intelligence.ts`
- `packages/supi-code-intelligence/src/targeting/resolve-file.ts`
- `packages/supi-code-intelligence/src/tool/execute-affected.ts`
- `packages/supi-code-intelligence/src/tool/execute-brief.ts`
- `packages/supi-code-intelligence/src/tool/execute-pattern.ts`
- `packages/supi-code-intelligence/src/tool/execute-relations.ts`
- `packages/supi-code-intelligence/src/use-case/generate-affected.ts`
- `packages/supi-code-intelligence/src/use-case/generate-brief.ts`
- `packages/supi-code-intelligence/src/use-case/generate-pattern.ts`
- `packages/supi-code-intelligence/src/use-case/generate-relations.ts`
- `packages/supi-code-intelligence/src/use-case/types.ts`
- `packages/supi-code-intelligence/__tests__/integration/fallback-chain.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/semantic-file-target.test.ts`

Create:
- `packages/supi-code-intelligence/src/workspace/request-context.ts`
- `packages/supi-code-intelligence/__tests__/helpers/register-mock-runtime.ts`
- `packages/supi-code-intelligence/__tests__/unit/workspace/request-context.test.ts`

Delete:
- `packages/supi-code-intelligence/src/provider/code-provider.ts`
- `packages/supi-code-intelligence/src/provider/registry.ts`
- `packages/supi-code-intelligence/src/provider/wiring.ts`
- `packages/supi-code-intelligence/__tests__/helpers/register-mock-provider.ts`
- `packages/supi-code-intelligence/__tests__/unit/provider/registry.test.ts`

## Change
Preserve the current public `code_*` tools and hidden overview behavior, but remove local ownership of the lower-layer runtime.

Implementation requirements:
- add `@mrclrchtr/supi-code-runtime` to `dependencies`
- create `src/workspace/request-context.ts` as the only place that reads shared runtime capability state for a cwd
- replace direct `getCodeProvider(...)` usage in tool executors and target resolution with runtime/context lookups
- delete provider composition/wiring from `src/code-intelligence.ts`; keep only code-intelligence-owned concerns such as overview injection and tool registration
- stop exporting provider registry types/functions from `src/api.ts` and `src/index.ts`
- keep the architecture model and `code_*` UX in this package
- preserve explicit unavailable behavior when semantic capability is absent instead of silently falling back to heuristic guesses

Do not rename the public `code_*` tools.

## TDD
### RED
Before removing the old registry:
1. Add/adjust failing tests in:
   - `packages/supi-code-intelligence/__tests__/unit/workspace/request-context.test.ts`
   - `packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`
   - `packages/supi-code-intelligence/__tests__/integration/fallback-chain.test.ts`
   - `packages/supi-code-intelligence/__tests__/unit/semantic-file-target.test.ts`
2. Confirm the current source layout still contains the provider registry/wiring layer:
   - `rg -n "provider/(registry|wiring)|getCodeProvider|registerCodeProvider" packages/supi-code-intelligence/src packages/supi-code-intelligence/__tests__`

The tests should prove:
- request-context reads the shared runtime state correctly
- `code_*` tools still return explicit unavailable/structural/semantic states with the new runtime source
- fallback behavior remains intentional and does not silently invent semantic answers
- overview injection still works without startup provider wiring

### GREEN
Implement the runtime-based request context, migrate call sites, and delete the local provider registry/wiring layer once the replacement tests pass.

### REFACTOR
Remove dead aliases/comments left from the old `CodeProvider` design and keep the API surface limited to orchestration/model helpers that genuinely belong in code-intelligence.

## Verification
Run:
- `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/workspace/request-context.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts packages/supi-code-intelligence/__tests__/integration/fallback-chain.test.ts packages/supi-code-intelligence/__tests__/unit/semantic-file-target.test.ts -v`
- `RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json -v`
- `RTK_DISABLED=1 pnpm exec biome check packages/supi-code-intelligence -v`
- `rg -n "provider/(registry|wiring)|getCodeProvider|registerCodeProvider" packages/supi-code-intelligence/src packages/supi-code-intelligence/__tests__`

Expected result: tests/typecheck/biome pass, and the final `rg` command returns no remaining implementation/test references to the deleted provider registry/wiring layer.
