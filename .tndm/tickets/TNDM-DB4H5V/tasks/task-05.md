# Task 5: Remove obsolete action-layer files, refresh docs, and run full package verification

## Goal
Finish the refactor cleanly by removing stale layer artifacts, updating maintainer/user documentation to match the new structure, and verifying the whole package from a clean state.

## Files
Modify:
- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` if final overview-wiring assertions need cleanup
- `packages/supi-code-intelligence/__tests__/unit/brief.test.ts` / `tool-adapters.test.ts` only if any imports still point at removed files

Delete if still present after earlier tasks:
- `packages/supi-code-intelligence/src/actions/brief-action.ts`
- `packages/supi-code-intelligence/src/actions/map-action.ts`
- `packages/supi-code-intelligence/src/actions/callers-action.ts`
- `packages/supi-code-intelligence/src/actions/callees-action.ts`
- `packages/supi-code-intelligence/src/actions/implementations-action.ts`
- `packages/supi-code-intelligence/src/actions/affected-action.ts`
- `packages/supi-code-intelligence/src/actions/pattern-action.ts`
- `packages/supi-code-intelligence/src/actions/semantic-references.ts`

## Change
1. Remove any remaining imports or compatibility shims that keep behavior living in the deleted action layer.
2. Update `README.md` source-layout notes so they describe `src/use-case/` and `src/presentation/markdown/` instead of `src/actions/*.ts` owning the behavior.
3. Update `CLAUDE.md` architecture guidance to match the final file layout and layering rules.
4. Run the full package verification suite after confirming no stale files, unused suppressions, or dead imports remain.

## Verification
Full-package verification:
- `RTK_DISABLED=1 pnpm -v exec vitest run packages/supi-code-intelligence/`
- `RTK_DISABLED=1 pnpm -v exec biome check packages/supi-code-intelligence`
- `RTK_DISABLED=1 pnpm -v exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json`
- `RTK_DISABLED=1 pnpm -v exec tsc --noEmit -p packages/supi-code-intelligence/__tests__/tsconfig.json`

Expected result: all tests pass, Biome is clean, both TypeScript checks pass, and the package no longer contains behavior-owning files under `src/actions/`.

