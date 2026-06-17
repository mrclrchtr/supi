# Overview

## Goal
Make SuPi code intelligence treat structural coverage as mandatory baseline and semantic coverage as always-attempted by default. Users and agents should be warned when that coverage is degraded, but the session should continue running.

## Approved behavior

### LSP policy
- SuPi must no longer allow global LSP disable through `lsp.enabled`.
- SuPi must no longer honor the `lsp.active` allowlist.
- SuPi must continue to support explicit per-language LSP disable through `lsp.servers.<language>.enabled: false`.
- Existing `lsp.enabled` and `lsp.active` config values remain readable only so SuPi can emit a deprecation warning that those keys are ignored.

### Tree-sitter policy
- Tree-sitter remains always-on.
- No user-facing Tree-sitter disable surface is introduced.
- If Tree-sitter startup fails, SuPi reports structural coverage as unavailable and warns loudly.

### Warning policy
After a short session-start grace period, SuPi must emit degraded-coverage warnings for:
- Tree-sitter initialization failure
- detected workspace languages whose LSP server binary is missing
- detected workspace languages explicitly disabled through `lsp.servers.<language>.enabled: false`
- deprecated `lsp.enabled` or `lsp.active` keys that are present but ignored

Warnings must be language-scoped when only part of semantic coverage is degraded. For example, Python missing `pyright-langserver` must not be reported as a blanket LSP outage.

### Warning surfaces
- one chat-visible warning message near session start, deduplicated so it does not spam
- persistent status/UI coverage indicators in `/supi-ci-status` and status/footer/widget output while the workspace remains degraded
- matching `code_health` output so tool-driven workflows see the same coverage state

## File map

### `packages/supi-lsp`
- `src/config/lsp-settings.ts` — stop treating `enabled` as an effective runtime switch; expose helpers for deprecated-key detection and any warning text needed by consumers
- `src/session/runtime-controller.ts` — remove global-disable and allowlist behavior; always attempt detected servers except languages explicitly disabled via `lsp.servers.<lang>.enabled: false`; expose enough startup state for missing-server / disabled-language reporting
- `src/session/scanner.ts` — continue using language detection and missing-server discovery; extend only if needed to distinguish detected-but-disabled languages cleanly
- `src/config/config.ts` / `src/config/server-config.ts` — keep per-language `enabled` support and preserve project-over-global override behavior
- `__tests__/unit/config.test.ts`, `__tests__/unit/runtime-controller.test.ts`, and related unit coverage — codify the new policy and deprecated-key behavior

### `packages/supi-code-intelligence`
- `src/lsp/settings.ts` — remove the global enable toggle and `Active Servers` allowlist UI; replace with a `Disabled Servers` UI that writes `lsp.servers.<language>.enabled: false`
- `src/lsp/session-lifecycle.ts` — add the grace-period health check and trigger warning evaluation after substrate startup settles
- new focused warning/evaluation module under `src/lsp/` — compute deprecated-config warnings, missing-server warnings, explicit-disable warnings, and Tree-sitter failure warnings from shared runtime and LSP controller state
- `src/ui/code-intelligence-status-command.ts` — surface degraded coverage in the gathered status data and persistent status/widget output
- `src/ui/code-intelligence-status-overlay.ts` — render degraded-coverage details clearly in the overlay
- `src/tool/execute-health.ts` and `src/presentation/markdown/health.ts` — add degraded-coverage reporting to `code_health`
- tests in `__tests__/unit/code-health-tool.test.ts`, `__tests__/unit/code-intelligence-status-command.test.ts`, `__tests__/unit/code-intelligence-status-overlay.test.ts`, plus any new focused warning tests — codify the new warning behavior and avoid regressions

### Docs
- `packages/supi-code-intelligence/README.md`
- `packages/supi-lsp/README.md`

These docs must remove `lsp.enabled` / `lsp.active` guidance, document per-language disable via `lsp.servers.<lang>.enabled: false`, and explain degraded-coverage warnings.

## Design constraints
- No hard startup failure: warn loudly and continue.
- No new Tree-sitter disable path.
- No automatic server installation or bootstrap workflow.
- Warnings should not fire for transient `pending` startup states during the grace period.
- Warning messages must stay specific and actionable.

## Verification expectations
The implementation should prove:
- deprecated global-disable and allowlist keys are ignored
- per-language disable still works and is reported as intentional reduced semantic coverage
- missing binaries produce language-scoped reduced semantic coverage warnings
- Tree-sitter failure produces structural coverage warnings
- `/supi-ci-status` and `code_health` show the same degraded-coverage model
- documentation and settings UI match runtime behavior