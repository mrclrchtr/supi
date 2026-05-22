# Task 2: Implement code_brief and code_map with distinct interpretive vs factual behavior

## Goal
Ship the first two focused tools with a clear boundary: `code_brief` remains interpretive, while `code_map` stays strictly factual.

## RED
1. Add `packages/supi-code-intelligence/__tests__/unit/map-action.test.ts` covering:
   - repo/package/directory scopes
   - acceptance of any directory path
   - rejection of file paths
   - factual output only (counts, directories, landmark files)
2. Update `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts` to assert the new per-tool detail types for brief/map outputs.
3. Run the verification command and confirm it fails before implementation.

## GREEN
1. Add `packages/supi-code-intelligence/src/tool/execute-brief.ts` and `packages/supi-code-intelligence/src/tool/execute-map.ts` as thin validators/adapters for the two tools.
2. Keep `packages/supi-code-intelligence/src/actions/brief-action.ts` as the interpretive implementation.
3. Add `packages/supi-code-intelligence/src/actions/map-action.ts` to replace the old factual `index` behavior; retire `packages/supi-code-intelligence/src/actions/index-action.ts` once imports move.
4. Update `packages/supi-code-intelligence/src/types.ts` so map results no longer masquerade as generic search details.

## REFACTOR
- Ensure `code_map` does not emit `startHere`, public-surface prioritization, or other brief-only analysis.
- Keep factual path/landmark logic reusable so later docs/tests can point at one implementation.
