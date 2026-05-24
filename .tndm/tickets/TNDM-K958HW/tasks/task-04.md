# Task 4: Do final cleanup, JSDoc pass, and full package verification

## Goal
Finish the refactor with naming/cleanup, ensure new targeting helpers are documented, and verify the package fresh end-to-end.

## Files
- review and finalize `packages/supi-code-intelligence/src/targeting/types.ts`
- review and finalize `packages/supi-code-intelligence/src/targeting/query.ts`
- review and finalize `packages/supi-code-intelligence/src/targeting/resolve-anchored.ts`
- review and finalize `packages/supi-code-intelligence/src/targeting/resolve-file.ts`
- review and finalize `packages/supi-code-intelligence/src/targeting/resolve-symbol.ts`
- review and finalize `packages/supi-code-intelligence/src/target-resolution.ts`
- review and finalize `packages/supi-code-intelligence/src/resolve-target.ts`
- update any touched tests under `packages/supi-code-intelligence/__tests__/unit/`

## Change
1. Remove transitional duplication left from extraction.
2. Add/clean JSDoc for exported targeting types and non-obvious policy helpers.
3. Run Biome fix/formatting if needed so the new module split matches repo style.
4. Confirm no behavior drift in error strings, disambiguation text, or action details metadata.

## Verification
Run fresh, in this order:
- `pnpm exec vitest run packages/supi-code-intelligence/__tests__/unit/targeting-query.test.ts packages/supi-code-intelligence/__tests__/unit/target-resolution.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`
- `pnpm exec biome check packages/supi-code-intelligence`
- `pnpm exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json`
- `pnpm exec tsc --noEmit -p packages/supi-code-intelligence/__tests__/tsconfig.json`

Expected result: all commands pass with no new warnings/errors that require follow-up.

## TDD / exemption
This task is **test-exempt for the cleanup portion only** because it is a post-green consolidation/documentation pass.
Rationale: the behavior-proving tests were added in Tasks 1-3.
Manual/command verification is mandatory through the full command list above.
