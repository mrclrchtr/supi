# Task 6: Refactor supi-code-intelligence to use shared workspace context and provider contracts

## Goal
Make `packages/supi-code-intelligence/` consume the shared workspace context/providers instead of repeatedly constructing local substrates and rebuilding architecture data per tool execution.

## Files
- `packages/supi-code-intelligence/package.json`
- `packages/supi-code-intelligence/src/code-intelligence.ts`
- `packages/supi-code-intelligence/src/resolve-target.ts`
- `packages/supi-code-intelligence/src/target-resolution.ts`
- `packages/supi-code-intelligence/src/targeting/query.ts`
- `packages/supi-code-intelligence/src/targeting/resolve-file.ts`
- `packages/supi-code-intelligence/src/targeting/resolve-symbol.ts`
- `packages/supi-code-intelligence/src/substrates/lsp-adapter.ts`
- `packages/supi-code-intelligence/src/substrates/tree-sitter-adapter.ts`
- `packages/supi-code-intelligence/src/tool/execute-brief.ts`
- `packages/supi-code-intelligence/src/tool/execute-map.ts`
- `packages/supi-code-intelligence/src/tool/execute-relations.ts`
- `packages/supi-code-intelligence/src/tool/execute-affected.ts`
- `packages/supi-code-intelligence/src/tool/execute-pattern.ts`
- `packages/supi-code-intelligence/src/use-case/generate-brief.ts`
- `packages/supi-code-intelligence/src/use-case/generate-relations.ts`
- `packages/supi-code-intelligence/src/use-case/generate-affected.ts`
- `packages/supi-code-intelligence/src/use-case/generate-pattern.ts`
- `packages/supi-code-intelligence/__tests__/unit/request-context.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/brief-context.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/relations-context.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/affected-context.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/pattern-context.test.ts`

## Change
- Add the shared-runtime dependency in `packages/supi-code-intelligence/package.json`, then run `pnpm install` before further TypeScript edits.
- Start with failing unit tests that prove workspace-context reuse, provider reuse, and stable tool-facing behavior for brief/relations/affected/pattern flows.
- Replace repeated `createSemanticSubstrate(...)`, `createStructuralSubstrate(...)`, and repeated architecture-model creation with shared workspace-context acquisition.
- Keep `src/target-resolution.ts` as a compatibility façade, but reduce it to a thin wrapper over the shared runtime-backed targeting flow.
- Keep public tool result formats stable; this phase changes orchestration internals, not the `code_*` contracts.
- Remove only those local adapter responsibilities that are fully superseded by the shared runtime context; do not strand callers on half-migrated helper shapes.

## Verification
TDD required.

Run in order:
- `pnpm install`
- `pnpm exec vitest run packages/supi-code-intelligence/__tests__/unit/request-context.test.ts packages/supi-code-intelligence/__tests__/unit/brief-context.test.ts packages/supi-code-intelligence/__tests__/unit/relations-context.test.ts packages/supi-code-intelligence/__tests__/unit/affected-context.test.ts packages/supi-code-intelligence/__tests__/unit/pattern-context.test.ts`
- `pnpm vitest run packages/supi-code-intelligence/`
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`
- `pnpm exec biome check packages/supi-code-intelligence`

Expected result: the new context-usage tests fail first, then pass while the package test suite remains green and public tool behavior stays unchanged.
