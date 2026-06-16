# Task 3: Align inspect guidance and public docs with the tightened trust contract

## Goal
Bring follow-up hints and public docs back into sync with the runtime contract after the trust cleanup.

## Files
- `packages/supi-code-intelligence/__tests__/unit/code-inspect-tool.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`
- `packages/supi-code-intelligence/src/use-case/generate-inspect.ts`
- `packages/supi-code-intelligence/src/tool/tool-specs.ts`
- `packages/supi-code-intelligence/src/workflow/schemas.ts`
- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`

## Change
- Add or tighten automated assertions first for any user-facing runtime or registration text that should not regress, especially:
  - `code_inspect` follow-up guidance must not tell users to call `code_context` with unsupported public `file`-style usage
  - registered metadata/guidance must stay aligned if `tool-specs.ts` or `workflow/schemas.ts` wording changes
- Update runtime follow-up hints in `generate-inspect.ts` to use the correct public `code_context` entrypoint style.
- Audit `README.md` and `CLAUDE.md` public-contract sections and remove stale or overbroad claims, including:
  - stale shared-input mentions such as `path` / `exportedOnly` when describing the current public `code_*` surface
  - any wording that implies helper names are always filtered from fallback test listings
- Update `tool-specs.ts` and `workflow/schemas.ts` only where public wording must change to stay aligned with the runtime/docs contract.

## Verification
- Automated:
  - `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-inspect-tool.test.ts packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts --reporter=verbose`
- Manual doc audit (test-exempt portion):
  - read the updated public-contract sections in `packages/supi-code-intelligence/README.md` and `packages/supi-code-intelligence/CLAUDE.md`
  - confirm they no longer document stale public inputs for the current surface and no longer overclaim helper-name filtering behavior

## Test strategy
Mixed:
- test-driven for runtime hint / registration-text changes
- test-exempt for README.md and CLAUDE.md prose-only edits, because those sections are documentation rather than executable logic
