# Task 3: Broaden best-effort test-label extraction and document the evidence contract

## Goal
Improve user-facing test labels without reintroducing low-signal noise, and document the final discovery/extraction contract.

## Files
- `packages/supi-code-intelligence/src/analysis/relations/tests.ts`
- `packages/supi-code-intelligence/src/tool/tool-specs.ts`
- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`
- `packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts`

## Change
Extend the shared analysis so test-label extraction is broader but still conservative.

Implementation requirements:
1. Prefer provider-backed/structural extraction when available.
2. Add broader language-agnostic best-effort recognition only when it can identify obvious test declarations without surfacing helper variables, fixture names, or generic outline symbols as labels.
3. When confidence is low, return no labels and render the explicit placeholder instead of guessing.
4. Keep support files under `__tests__/helpers/` and `__tests__/fixtures/` excluded from runnable-test output.
5. Update public descriptions and maintainer docs so they explicitly say:
   - provenance refers to **discovery evidence only**
   - test-label extraction is a separate concern
   - empty placeholders are intentional honesty, not missing rendering

Start this task with failing extraction-focused assertions in the listed test files, then implement the minimum code needed to make them pass.

## Verification
Run the extraction-focused suite and confirm the new expectations pass:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts \
  packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts \
  --reporter=verbose
```

Expected result for this task: recognized labels are shown only when justified, helper-symbol noise does not leak back, and docs/tool descriptions match the implemented contract.

## Test mode
Test-driven.
