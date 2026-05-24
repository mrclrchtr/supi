# Task 1: Promote stable LSP library APIs for external session orchestration

## Goal
Create a stable, pi-independent LSP runtime surface that `packages/supi-code-intelligence` can consume through `@mrclrchtr/supi-lsp/api`.

## Changes
1. Add `packages/supi-lsp/src/session/runtime-controller.ts` as the new session-scoped library controller.
   - It should own the non-UI parts of session start/shutdown.
   - It should create and dispose the `LspManager`.
   - It should publish `SessionLspService` states through the existing registry.
   - It should expose the data the umbrella adapter will need later: manager/service state, project server snapshots, and disabled/pending/unavailable states.
2. Add `packages/supi-lsp/src/config/lsp-settings.ts` and move non-UI config helpers there.
   - Move `LspSettings`, `loadLspSettings`, and `getLspDisabledMessage` out of `packages/supi-lsp/src/session/settings-registration.ts`.
   - Leave `packages/supi-lsp/src/session/settings-registration.ts` temporarily as the pi-specific registration wrapper until the cleanup task removes the old adapter.
3. Export the new controller/settings helpers from `packages/supi-lsp/src/api.ts` and `packages/supi-lsp/src/index.ts`.
4. Keep the existing `packages/supi-lsp/src/lsp.ts` extension working unchanged enough for the interim tasks; do not remove the old pi adapter in this task.

## Test plan
- Add `packages/supi-lsp/__tests__/unit/runtime-controller.test.ts` first and make it fail for the missing controller behavior.
- Update `packages/supi-lsp/__tests__/unit/service-registry.test.ts` if the registry contract grows.
- Update or split `packages/supi-lsp/__tests__/unit/settings-registration.test.ts` so the non-UI helpers are exercised through the new library file instead of only through the old registration module.
