# Task 5: [TDD RED] Lock adjacent code-only surface behavior in discovery and /ci-status

## Goal
Capture stale surrounding assumptions that still treat substrate-named tools as the public surface.

## Files
- `packages/supi-claude-md/__tests__/unit/discovery.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-command.test.ts`

## Change
Add failing tests that prove the desired surrounding behavior before implementation:
1. subdirectory path extraction recognizes representative active `code_*` tools with concrete `file` / `path` inputs instead of relying only on `lsp_*` / `tree_sitter_*`
2. `/ci-status` reports the active code-intelligence tool family without surfacing removed substrate-named public tools

Create `packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-command.test.ts` if no direct command test exists yet.

## Verification
Run the focused discovery and status-command tests and confirm they fail before changing production code:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-claude-md/__tests__/unit/discovery.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-command.test.ts
```

Expected result: the new assertions fail for the current implementation.

## Test mode
Test-driven (RED). Do not change production code in this task.
