# Task 3: Migrate the LSP session registry to the shared core helper

## Goal
Swap the LSP session-registry storage layer over to the new shared core helper while preserving the full public API, including `pending`, `inactive`, `disabled`, and the package-local wait helper.

## Changes
- Update `packages/supi-lsp/src/session/service-registry.ts` so the backing storage uses the shared `supi-core` session registry helper.
- Keep these LSP-specific behaviors in this file:
  - `SessionLspServiceState`
  - `waitForSessionLspService(cwd, timeoutMs)` polling semantics
  - the `unavailable` fallback message when no state exists
- Preserve the current exported function names and signatures:
  - `setSessionLspServiceState(cwd, state)`
  - `getSessionLspService(cwd)`
  - `waitForSessionLspService(cwd, timeoutMs)`
  - `clearSessionLspService(cwd)`
- Update `packages/supi-lsp/__tests__/unit/service-registry.test.ts` only as needed to keep the current behavior covered after the storage refactor.

## TDD
1. Adjust `packages/supi-lsp/__tests__/unit/service-registry.test.ts` first if you need stronger assertions around normalized cwd behavior or shared module instances.
2. Run `pnpm vitest run packages/supi-lsp/__tests__/unit/service-registry.test.ts -v` and confirm it fails before the migration.
3. Implement the storage migration without changing package-local wait logic.
4. Re-run the verification command until tests and typechecks pass.
