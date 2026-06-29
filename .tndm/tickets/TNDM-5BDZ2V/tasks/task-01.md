# Task 1: Remove "Next steps" guidance from code_resolve renderer

## Goal
Delete ~120 tokens of guidance text from `code_resolve` output.

## Files
- `packages/supi-code-intelligence/src/presentation/markdown/resolve.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts`

## Changes

### `resolve.ts`

1. In `renderResolved()` (single-target branch): delete the entire `if (!options?.isAnchoredCall)` block (lines ~63–77) that emits 7 "Next steps" follow-up suggestions. Also delete the `else` branch (lines ~78–82) that emits the anchored one-liner `_Use targetId with…_`. Replace with nothing — the targetId is already in the output.

2. In `renderResolved()` (multi-target branch): delete the "Use a `targetId` with…" fallback line (lines ~87–89).

3. In `renderDisambiguation()`: delete the "Next steps:" block (lines ~108–114) that suggests rerunning with anchored coords or using candidate targetIds.

### `code-resolve-tool.test.ts`

Lines 147-148 assert `toContain("targetId")` and `toContain("code_context")` on anchored results. These check the now-removed anchored one-liner. Update the assertions:
- Keep `expect(result.content[0].text).toContain("Target ID:")` — still present
- Keep `expect(result.content[0].text).toContain("Span ID:")` — still present
- Keep `expect(result.content[0].text).toContain("index.ts")` — still present
- Remove or update the `toContain("targetId")` and `toContain("code_context")` assertions — these checked the guidance text. Replace with a negative assertion: `expect(result.content[0].text).not.toContain("Next steps")`.

## Verification
- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts`
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`
