# Archive

## Fresh verification evidence (TNDM-K958HW)

### Task 1 — targeting query/types layer
- Created `src/targeting/types.ts`, `src/targeting/query.ts`, `__tests__/unit/targeting-query.test.ts`
- RED: confirmed test failed with module-not-found
- GREEN: all 8 `normalizeQuery` tests pass
- TypeScript: `pnpm exec tsc --noEmit -p __tests__/tsconfig.json` → no errors

### Task 2 — anchored and symbol resolvers
- Created `src/targeting/resolve-anchored.ts`, `src/targeting/resolve-symbol.ts`
- Updated `target-resolution.ts` → slim facade delegating to new modules
- Updated `resolve-target.ts` → simplified through normalized query routing
- Extended test coverage (semantic-unavailable assertion, rangeless-candidate → disambiguation)
- `pnpm exec vitest run __tests__/unit/target-resolution.test.ts __tests__/unit/tool-adapters.test.ts` → 28 PASS
- `pnpm exec biome check src/target-resolution.ts src/resolve-target.ts src/targeting __tests__/unit/target-resolution.test.ts` → clean after format

### Task 3 — file-surface resolution and action integration
- Created `src/targeting/resolve-file.ts` with explicit fallback substrate injection
- Updated `target-resolution.ts` → `resolveFileTargetGroup` delegates to new module
- All 5 actions (brief, callers, callees, implementations, affected) consume pipeline through `resolve-target.ts` with no surface change
- `pnpm exec vitest run __tests__/unit/target-resolution.test.ts __tests__/unit/tool-adapters.test.ts __tests__/unit/targeting-query.test.ts` → 36 PASS
- Package typecheck: `pnpm exec tsc --noEmit` → no errors

### Task 4 — cleanup and JSDoc pass
- Removed transitional duplication (old private helpers from target-resolution.ts)
- All exported types in `src/targeting/` have JSDoc
- Updated `CLAUDE.md` architecture listing to reflect new `targeting/` directory
- Final verification:
  - `pnpm exec vitest run __tests__/unit/targeting-query.test.ts __tests__/unit/target-resolution.test.ts __tests__/unit/tool-adapters.test.ts` → 36/36 PASS
  - `pnpm exec biome check packages/supi-code-intelligence` → clean
  - `pnpm exec tsc --noEmit -p tsconfig.json` → no errors
  - `pnpm exec tsc --noEmit -p __tests__/tsconfig.json` → no errors

### Files changed
- **New files:** `src/targeting/types.ts`, `src/targeting/query.ts`, `src/targeting/resolve-anchored.ts`, `src/targeting/resolve-symbol.ts`, `src/targeting/resolve-file.ts`, `__tests__/unit/targeting-query.test.ts`
- **Modified:** `src/target-resolution.ts` (slimmed 400→100 lines), `src/resolve-target.ts` (simplified routing), `__tests__/unit/target-resolution.test.ts` (extended coverage), `CLAUDE.md` (updated source listing)
- **Deleted from old module:** ~250 lines of duplicated/nested helpers
