# Task 4: Make code_affected substrate-only and keep code_pattern as the sole heuristic tool

## Goal
Enforce the new heuristic boundary:
- `code_affected` = semantic references + architecture model only
- `code_pattern` = explicit heuristic/structured search only

## RED
1. Update `packages/supi-code-intelligence/__tests__/integration/fallback-chain.test.ts` to assert that affected analysis no longer falls through to grep.
2. Update `packages/supi-code-intelligence/__tests__/unit/tool-actions.test.ts` and `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts` so `heuristic` confidence is expected only from the pattern tool.
3. Run the verification command and confirm it fails for the old fallback behavior.

## GREEN
1. Add `packages/supi-code-intelligence/src/tool/execute-affected.ts` and `packages/supi-code-intelligence/src/tool/execute-pattern.ts` as thin public-tool adapters.
2. Update `packages/supi-code-intelligence/src/actions/affected-action.ts` to stop using ripgrep as an automatic backup path and to emit clear unavailable guidance when semantic data is missing.
3. Keep `packages/supi-code-intelligence/src/actions/pattern-action.ts` as the sole place where heuristic/structured search is public behavior.
4. Update shared result/detail types so the new tool contracts are explicit.

## REFACTOR
- Remove wording that suggests `code_pattern` is merely a fallback; it should be presented as the intentional search tool.
- Keep regex/structured pattern validation unchanged unless a failing test shows a clearer contract is needed.
