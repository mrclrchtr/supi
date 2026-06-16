# Task 2: Make changedFiles impact truly structural-only

## Goal
Make the `code_impact` `changedFiles` path match its public contract exactly: structural/file-level analysis plus path-based test discovery, with no semantic-reference assist.

## Files
- `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts`
- `packages/supi-code-intelligence/src/use-case/generate-impact.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/impact.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/affected.ts`

## Change
- Follow RED → GREEN for this concern.
- First, extend the impact regression coverage so it proves all of the following for `changedFiles` requests:
  - likely-test discovery does not depend on semantic references
  - the output still finds convention-based test companions when they exist
  - the `**Evidence: structural**` footer remains present and accurate
- Run the focused impact test and confirm it fails before changing runtime behavior.
- Then remove semantic-reference input from the `changedFiles` likely-test path, keeping the current structural/file-level module analysis model intact.
- Preserve or tighten any heading/provenance wording in the changed-files renderer so the wording matches the final runtime path exactly.

## Verification
- Run:
  - `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts --reporter=verbose`
- Expected result:
  - the new regression fails before the implementation change for the correct evidence-path reason
  - after the change, the command passes and changed-files output still contains `**Evidence: structural**`

## Test strategy
Test-driven.
