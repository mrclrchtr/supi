# Task 2: Publish semantic and optional refactor capabilities from supi-lsp into the shared broker

## Goal
Teach `supi-lsp` to publish semantic facts plus precise refactor/edit capability through the shared broker without exposing `LspManager` internals or breaking the existing expert `lsp_*` tools.

## Files
- Modify `packages/supi-lsp/src/provider/lsp-semantic-provider.ts`
- Add `packages/supi-lsp/src/provider/lsp-refactor-provider.ts` only if the adapter would otherwise make `lsp-semantic-provider.ts` unreasonably large
- Modify `packages/supi-lsp/src/session/runtime-registration.ts`
- Modify `packages/supi-lsp/src/session/service-registry.ts`
- Modify `packages/supi-lsp/src/api.ts`
- Modify tests:
  - `packages/supi-lsp/__tests__/unit/semantic-provider.test.ts`
  - `packages/supi-lsp/__tests__/unit/runtime-registration.test.ts`
- Add `packages/supi-lsp/__tests__/unit/refactor-provider.test.ts`
- Update docs if the exported API surface changes:
  - `packages/supi-lsp/README.md`
  - `packages/supi-lsp/CLAUDE.md`

## Change
Follow TDD.

### RED
1. Add failing tests in `packages/supi-lsp/__tests__/unit/refactor-provider.test.ts` for:
   - rename/code-action style requests that return precise workspace edits
   - explicit unavailable/disambiguation results when the LSP service cannot produce a safe edit set
   - no heuristic/text fallback for refactor operations
2. Extend `packages/supi-lsp/__tests__/unit/runtime-registration.test.ts` with failing expectations that the runtime registration publishes semantic capability state including refactor readiness, without introducing a separate third broker slot.
3. Extend `packages/supi-lsp/__tests__/unit/semantic-provider.test.ts` only where the new broker contract changes adapter output.
4. Run:
   - `RTK_DISABLED=1 pnpm vitest run packages/supi-lsp/__tests__/unit/refactor-provider.test.ts packages/supi-lsp/__tests__/unit/runtime-registration.test.ts packages/supi-lsp/__tests__/unit/semantic-provider.test.ts -v`
   Confirm the failures are specifically about the missing refactor capability / broker registration contract.

### GREEN
5. Implement the refactor adapter in `packages/supi-lsp/src/provider/lsp-semantic-provider.ts` or `packages/supi-lsp/src/provider/lsp-refactor-provider.ts`, converting `SessionLspService` rename/code-action/workspace-edit operations into the shared runtime contract.
6. Update `packages/supi-lsp/src/session/service-registry.ts` and `packages/supi-lsp/src/api.ts` only as needed to expose the data the refactor path needs while preserving the rule that the public API does not leak manager internals.
7. Update `packages/supi-lsp/src/session/runtime-registration.ts` so LSP session startup/shutdown registers semantic capability state plus whether precise refactors are available.
8. Keep the existing `lsp_*` tool behavior intact; this task is substrate publication, not the new public `code_refactor` UX.

### REFACTOR
9. Simplify duplicated conversion logic if needed, but keep adapter responsibilities focused.
10. Update `packages/supi-lsp/README.md` and `packages/supi-lsp/CLAUDE.md` so maintainer docs describe the broker/refactor publication responsibilities accurately.

## Verification
Run all of the following:
- `RTK_DISABLED=1 pnpm vitest run packages/supi-lsp/__tests__/unit/refactor-provider.test.ts packages/supi-lsp/__tests__/unit/runtime-registration.test.ts packages/supi-lsp/__tests__/unit/semantic-provider.test.ts -v`
- `pnpm exec tsc -b packages/supi-lsp/tsconfig.json packages/supi-lsp/__tests__/tsconfig.json`
- `pnpm exec biome check packages/supi-lsp`

## Test status
Test-driven.
