# Task 4: GREEN: implement coverage warning evaluation, startup warning flow, status surfaces, health reporting, and Disabled Servers UI

## Goal
Implement the code-intelligence side of the new coverage policy so degraded substrate coverage is explicit to both users and agents.

## Files
- `packages/supi-code-intelligence/src/lsp/session-lifecycle.ts`
- `packages/supi-code-intelligence/src/lsp/runtime-state.ts`
- `packages/supi-code-intelligence/src/lsp/settings.ts`
- `packages/supi-code-intelligence/src/lsp/coverage-warnings.ts` (new)
- `packages/supi-code-intelligence/src/ui/code-intelligence-status-command.ts`
- `packages/supi-code-intelligence/src/ui/code-intelligence-status-overlay.ts`
- `packages/supi-code-intelligence/src/tool/execute-health.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/health.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-health-tool.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-command.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-overlay.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/lsp-settings.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/lsp-coverage-warnings.test.ts`

## Change
- Add a focused warning-evaluation module that takes the shared runtime state plus LSP startup metadata and returns a normalized degraded-coverage report.
- Store enough session-local state to deduplicate warning emission and respect the startup grace period.
- Emit one chat-visible warning message when the workspace remains degraded after the grace period.
- Surface the same degraded-coverage reasons in `/supi-ci-status`, the overlay, the footer/status/widget output, and `code_health`.
- Replace the LSP settings UI with a `Disabled Servers` control that writes per-language `lsp.servers.<language>.enabled: false` entries and removes the broad global-disable / allowlist controls.
- Keep the messaging precise:
  - language-scoped warnings for missing or explicitly disabled servers
  - structural-failure warning when Tree-sitter is unavailable
  - deprecation warning when ignored keys are present

## Verification
- Re-run `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-health-tool.test.ts packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-command.test.ts packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-overlay.test.ts packages/supi-code-intelligence/__tests__/unit/lsp-settings.test.ts packages/supi-code-intelligence/__tests__/unit/lsp-coverage-warnings.test.ts --reporter=verbose` and confirm they pass.
- Run `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`.
- Run `pnpm exec biome check packages/supi-code-intelligence/src/lsp/session-lifecycle.ts packages/supi-code-intelligence/src/lsp/runtime-state.ts packages/supi-code-intelligence/src/lsp/settings.ts packages/supi-code-intelligence/src/lsp/coverage-warnings.ts packages/supi-code-intelligence/src/ui/code-intelligence-status-command.ts packages/supi-code-intelligence/src/ui/code-intelligence-status-overlay.ts packages/supi-code-intelligence/src/tool/execute-health.ts packages/supi-code-intelligence/src/presentation/markdown/health.ts packages/supi-code-intelligence/__tests__/unit/code-health-tool.test.ts packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-command.test.ts packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-overlay.test.ts packages/supi-code-intelligence/__tests__/unit/lsp-settings.test.ts packages/supi-code-intelligence/__tests__/unit/lsp-coverage-warnings.test.ts`.

## TDD
This is the GREEN task for Task 3. Keep the implementation aligned with the test-defined warning contract.
