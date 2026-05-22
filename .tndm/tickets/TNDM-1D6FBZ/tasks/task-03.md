# Task 3: Rework relations and target resolution to be substrate-only with no heuristic fallback

## Goal
Make `code_relations` honest about its substrate requirements:
- `callers` = semantic only
- `callees` = structural only
- `implementations` = semantic only

## RED
1. Rewrite `packages/supi-code-intelligence/__tests__/integration/fallback-chain.test.ts` so callers/implementations no longer expect ripgrep fallback.
2. Update `packages/supi-code-intelligence/__tests__/unit/target-resolution.test.ts` and `packages/supi-code-intelligence/__tests__/unit/semantic-file-target.test.ts` to cover semantic-only symbol/file resolution and explicit unavailable/disambiguation paths.
3. Update `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts` for the new relation-detail contract.
4. Run the verification command and confirm the tests fail for the old fallback behavior.

## GREEN
1. Add `packages/supi-code-intelligence/src/tool/execute-relations.ts` to validate the new `kind` parameter and dispatch to the correct substrate-backed action.
2. Update `packages/supi-code-intelligence/src/resolve-target.ts` and `packages/supi-code-intelligence/src/target-resolution.ts` so non-search tools stop using heuristic symbol fallback.
3. Update the three relation action files so they return semantic/structural/unavailable outcomes only and keep disambiguation explicit.
4. Preserve supported file-level expansion only where the required substrate can provide it.

## REFACTOR
- Remove any relation-specific wording that still mentions heuristic search as an automatic next step.
- Keep relation confidence vocabulary consistent so `heuristic` is no longer reachable from this tool.
