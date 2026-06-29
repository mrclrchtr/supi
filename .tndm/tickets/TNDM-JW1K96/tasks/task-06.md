# Task 6: Final verification: targeted package checks, repo verify, and degraded-coverage smoke test

## Goal
Prove the full change works end-to-end after the implementation tasks are complete.

## Files
- No new files; this task verifies the assembled change across `packages/supi-lsp` and `packages/supi-code-intelligence`.

## Change
- Run the focused package-level checks for the new LSP policy and degraded-coverage UI/health surfaces.
- Run the full repo verification command required by the workspace.
- Perform one manual smoke test that exercises the startup warning and persistent coverage reporting.

## Verification
1. Run `RTK_DISABLED=1 pnpm vitest run packages/supi-lsp/__tests__/unit/config.test.ts packages/supi-lsp/__tests__/unit/runtime-controller.test.ts packages/supi-code-intelligence/__tests__/unit/code-health-tool.test.ts packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-command.test.ts packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-overlay.test.ts packages/supi-code-intelligence/__tests__/unit/lsp-settings.test.ts packages/supi-code-intelligence/__tests__/unit/lsp-coverage-warnings.test.ts --reporter=verbose`.
2. Run `pnpm verify:ai`.
3. Manual smoke test:
   - configure a workspace with either a deprecated `lsp.active` key or an explicit per-language disable such as `lsp.servers.python.enabled: false`
   - start or reload pi in that workspace
   - confirm exactly one startup warning message appears after the grace period
   - confirm `/supi-ci-status` shows degraded coverage
   - confirm `code_health` reports the same degraded-coverage reason

## TDD
This is the final verification task. No production edits should remain after this step; only fixes needed to make the whole change pass cleanly.
