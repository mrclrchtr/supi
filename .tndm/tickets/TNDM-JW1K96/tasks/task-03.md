# Task 3: RED: codify degraded-coverage warnings, health output, and Disabled Servers settings behavior

## Goal
Define the user-facing contract for degraded coverage in code-intelligence before changing runtime wiring.

## Files
- `packages/supi-code-intelligence/__tests__/unit/code-health-tool.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-command.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-overlay.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/lsp-settings.test.ts` (new)
- `packages/supi-code-intelligence/__tests__/unit/lsp-coverage-warnings.test.ts` (new)

## Change
- Add failing tests that define the degraded-coverage warning model for:
  - deprecated `lsp.enabled` / `lsp.active` keys that are ignored
  - detected languages explicitly disabled via `lsp.servers.<lang>.enabled: false`
  - detected languages whose LSP server binary is missing
  - Tree-sitter startup failure
- Add failing tests that require a one-time chat-visible warning after a short grace period rather than on the initial transient `pending` state.
- Add failing tests that require `/supi-ci-status`, its overlay, and `code_health` to report the same degraded-coverage reasons.
- Add failing settings tests that require the LSP settings section to remove the global enable toggle and `Active Servers` allowlist UI, and replace them with a `Disabled Servers` control that persists `lsp.servers.<language>.enabled: false`.

## Verification
- Run `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-health-tool.test.ts packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-command.test.ts packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-overlay.test.ts packages/supi-code-intelligence/__tests__/unit/lsp-settings.test.ts packages/supi-code-intelligence/__tests__/unit/lsp-coverage-warnings.test.ts --reporter=verbose`.
- Confirm the new assertions fail for the expected reasons before implementation.

## TDD
This is a RED task. Do not change production code here.
