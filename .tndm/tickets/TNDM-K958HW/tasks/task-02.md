# Task 2: Extract anchored and symbol resolvers behind a typed target-resolution facade

## Goal
Move anchored and semantic symbol resolution out of the monolithic `src/target-resolution.ts` implementation while preserving current behavior and import compatibility.

## Files
- create `packages/supi-code-intelligence/src/targeting/resolve-anchored.ts`
- create `packages/supi-code-intelligence/src/targeting/resolve-symbol.ts`
- update `packages/supi-code-intelligence/src/target-resolution.ts`
- update `packages/supi-code-intelligence/src/resolve-target.ts`
- update `packages/supi-code-intelligence/__tests__/unit/target-resolution.test.ts`

## Change
1. Start RED by extending `target-resolution.test.ts` to cover:
   - anchored target success/error behavior through the facade
   - semantic-unavailable symbol resolution
   - disambiguation with multiple candidates
   - rangeless candidates not being promoted to single-match resolution
2. Extract anchored resolution into `resolve-anchored.ts` and symbol discovery into `resolve-symbol.ts`.
3. Keep `src/target-resolution.ts` as the stable import surface, but reduce it to orchestration/re-export logic over the new modules.
4. Simplify `src/resolve-target.ts` so it routes normalized queries and converts typed resolver outcomes into the existing user-facing string/disambiguation output.
5. Avoid hidden substrate construction in the symbol resolver; pass semantic substrate access explicitly from the caller/facade.

## Verification
- RED then GREEN: `pnpm exec vitest run packages/supi-code-intelligence/__tests__/unit/target-resolution.test.ts`
- Regression check: `pnpm exec vitest run packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`
- Lint targeted files before moving on: `pnpm exec biome check packages/supi-code-intelligence/src/target-resolution.ts packages/supi-code-intelligence/src/resolve-target.ts packages/supi-code-intelligence/src/targeting packages/supi-code-intelligence/__tests__/unit/target-resolution.test.ts`

## TDD
Required. Watch the new/updated symbol-resolution assertions fail before extracting logic.
