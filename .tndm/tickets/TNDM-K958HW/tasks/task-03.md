# Task 3: Extract file-surface resolution and update code-intelligence actions to use the pipeline

## Goal
Separate file-level target-group resolution from the facade, make semantic/structural fallback rules explicit, and update the `code_*` actions to consume the simplified pipeline.

## Files
- create `packages/supi-code-intelligence/src/targeting/resolve-file.ts`
- update `packages/supi-code-intelligence/src/target-resolution.ts`
- update `packages/supi-code-intelligence/src/resolve-target.ts`
- update `packages/supi-code-intelligence/src/actions/brief-action.ts`
- update `packages/supi-code-intelligence/src/actions/callers-action.ts`
- update `packages/supi-code-intelligence/src/actions/callees-action.ts`
- update `packages/supi-code-intelligence/src/actions/implementations-action.ts`
- update `packages/supi-code-intelligence/src/actions/affected-action.ts`
- update `packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`
- update `packages/supi-code-intelligence/__tests__/unit/target-resolution.test.ts`

## Change
1. Start RED with tests that pin file-level behavior:
   - file-only callers still discover exported file surfaces
   - file-level target discovery still prefers semantic document symbols when available and falls back to Tree-sitter exports otherwise
   - file-level unsupported/unavailable cases still return explicit non-heuristic messages
2. Extract file-surface resolution into `resolve-file.ts` with explicit dependency injection for semantic and structural substrates.
3. Remove or minimize deep fallback calls like `createSemanticSubstrate()` / `createStructuralSubstrate()` inside the low-level resolver path unless a thin compatibility shim is strictly needed.
4. Update action call sites so they consume the new typed result flow without changing public content/details behavior.
5. Preserve current non-goals: no heuristic text-search fallback and no public schema changes.

## Verification
- RED then GREEN: `pnpm exec vitest run packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts packages/supi-code-intelligence/__tests__/unit/target-resolution.test.ts`
- Package typecheck: `pnpm exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json`

## TDD
Required. The file-only callers behavior in `tool-adapters.test.ts` must fail first if the resolver pipeline is not wired correctly.
