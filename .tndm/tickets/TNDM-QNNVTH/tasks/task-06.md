# Task 6: [TDD GREEN] Update adjacent package behavior to match the code-only public surface

## Goal
Make nearby runtime behavior match the current public model: `code_*` is the public tool family, while LSP and Tree-sitter remain substrates.

## Files
- `packages/supi-claude-md/src/discovery.ts`
- `packages/supi-claude-md/__tests__/unit/discovery.test.ts`
- `packages/supi-code-intelligence/src/ui/code-intelligence-status-command.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-command.test.ts`

## Change
Implement the smallest runtime changes required to satisfy Task 5:
- teach `supi-claude-md` discovery to recognize the active `code_*` tool inputs that should trigger subdirectory-context scanning
- keep path extraction focused on tools that actually provide a concrete file/path input
- update `/ci-status` so the visible active-tool list reflects the code-only public surface rather than the removed substrate-named tool families
- avoid expanding this task into broader discovery heuristics or unrelated command redesign

## Verification
Re-run the Task 5 tests and confirm they pass:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-claude-md/__tests__/unit/discovery.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-command.test.ts
```

Expected result: all targeted tests pass.

## Test mode
Test-driven (GREEN). Limit production changes to the behavior covered by the RED tests.
