# Task 1: [TDD RED] Lock targetId follow-up fidelity regressions

## Goal
Capture the current mismatch where a symbol-resolved `targetId` is weaker than the best practical anchored call for downstream graph follow-ups.

## Files
- `packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/workflow-target-store.test.ts`

## Change
Add failing regression coverage that proves all of the following before implementation starts:
1. a `targetId` produced by `code_resolve` for a symbol can drive `code_graph({ relations: ["callees"] })` without degrading to the weaker declaration-start anchor behavior observed in manual testing
2. downstream results preserve the stored symbol identity instead of falling back to anonymous `symbol at ...` labeling when that identity is known
3. the target-store expectations still cover preserved metadata and stale-target rejection under the refined anchor strategy

Prefer extending the existing `code_resolve` and workflow-target-store tests instead of creating a parallel test harness.

## Verification
Run the targeted tests and confirm they fail for the new assertions before changing implementation code:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts \
  packages/supi-code-intelligence/__tests__/unit/workflow-target-store.test.ts
```

Expected result: the new regression assertions fail for the current implementation, demonstrating the behavior gap.

## Test mode
Test-driven (RED). Do not change implementation files in this task.
