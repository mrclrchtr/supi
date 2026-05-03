## 1. Core Debug Registry

- [x] 1.1 Add `packages/supi-core/debug-registry.ts` with globalThis-backed event storage, configuration, ring-buffer retention, filtering, summary, and cleanup APIs.
- [x] 1.2 Define exported debug event/config types and re-export the new APIs from `packages/supi-core/index.ts`.
- [x] 1.3 Add reusable best-effort redaction helpers for secret-like keys and command/payload strings.
- [x] 1.4 Add supi-core unit tests for enabled/disabled recording, max-event trimming, filtering, sanitized/raw views, redaction, summary, and cleanup.
- [x] 1.5 Audit and update downstream `vi.mock("@mrclrchtr/supi-core")` factories for the new runtime exports.

## 2. Supi Debug Extension Package

- [x] 2.1 Create `packages/supi-debug` package structure with `package.json`, `tsconfig.json`, extension entrypoint, and test config.
- [x] 2.2 Register config-backed debug settings for `enabled`, `agentAccess`, `maxEvents`, and `notifyLevel`.
- [x] 2.3 Configure the core debug registry from merged SuPi config on extension load/session start.
- [x] 2.4 Register a debug context provider that returns aggregate counts only and omits detailed event payloads.
- [x] 2.5 Add package-level tests for settings registration, registry configuration, session reset, and context-provider summary behavior.

## 3. User and Agent Debug Surfaces

- [x] 3.1 Implement `/supi-debug` to render recent sanitized debug events with useful disabled/no-match messages.
- [x] 3.2 Register the `supi_debug` tool with source, level, category, limit, and `includeRaw` parameters.
- [x] 3.3 Enforce `agentAccess` modes in the tool: `off`, `sanitized`, and `raw`.
- [x] 3.4 Add tool prompt snippet/guidelines that clearly describe when the agent should use `supi_debug`.
- [x] 3.5 Add tests for command output and tool access behavior, including raw-denied and raw-permitted calls.

## 4. RTK Integration

- [x] 4.1 Change RTK rewrite internals to return structured results with reason classification, duration, stdout/stderr where useful, and timeout information.
- [x] 4.2 Record RTK debug events for fallback, rewrite, and unchanged outcomes without changing command execution behavior.
- [x] 4.3 Preserve existing RTK rewrite/fallback statistics and once-per-session unavailable-binary notification behavior.
- [x] 4.4 Add/update RTK tests for timeout, unavailable binary, non-zero exit, empty output, non-zero with usable stdout, successful rewrite, unchanged rewrite, and debug-disabled behavior.

## 5. Workspace and Meta-package Wiring

- [x] 5.1 Add `packages/supi-debug` to workspace/package references as needed.
- [x] 5.2 Wire the extension into root `package.json` `pi.extensions` for workspace-local use.
- [x] 5.3 Add a `packages/supi/debug.ts` wrapper and include it in `packages/supi/package.json` extension/dependency metadata.
- [x] 5.4 Run `pnpm install` if package manifests or lockfile-affecting dependencies changed.

## 6. Verification

- [x] 6.1 Run package-scoped Biome checks for `supi-core`, `supi-debug`, and `supi-rtk`.
- [x] 6.2 Run package-scoped typechecks for source and tests in `supi-core`, `supi-debug`, and `supi-rtk`.
- [x] 6.3 Run targeted Vitest suites for `supi-core`, `supi-debug`, `supi-rtk`, and any affected meta-package/resource tests.
- [x] 6.4 Run `pnpm verify` or document any environmental blockers.
- [ ] 6.5 Manually smoke-test `/supi-settings`, `/supi-debug`, `supi_debug`, `/supi-context`, and RTK fallback recording in a Pi session after `/reload`.
