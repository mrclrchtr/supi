# Task 4: Split supi-lsp manager responsibilities and expose a shared semantic provider

## Goal
Break `packages/supi-lsp/src/manager/manager.ts` into smaller runtime subsystems and expose a semantic provider compatible with the shared runtime contracts, without changing the `lsp_*` tool surface.

## Files
- `packages/supi-lsp/package.json`
- `packages/supi-lsp/src/api.ts`
- `packages/supi-lsp/src/index.ts`
- `packages/supi-lsp/src/session/service-registry.ts`
- `packages/supi-lsp/src/session/lsp-state.ts`
- `packages/supi-lsp/src/handlers/session-lifecycle.ts`
- `packages/supi-lsp/src/provider/lsp-semantic-provider.ts`
- `packages/supi-lsp/src/manager/client-pool.ts`
- `packages/supi-lsp/src/manager/workspace-router.ts`
- `packages/supi-lsp/src/manager/diagnostic-store.ts`
- `packages/supi-lsp/src/manager/recovery-coordinator.ts`
- `packages/supi-lsp/src/manager/capability-index.ts`
- `packages/supi-lsp/src/manager/manager.ts`
- `packages/supi-lsp/__tests__/unit/semantic-provider.test.ts`
- `packages/supi-lsp/__tests__/unit/client-pool.test.ts`
- `packages/supi-lsp/__tests__/unit/workspace-router.test.ts`
- `packages/supi-lsp/__tests__/unit/diagnostic-store.test.ts`
- `packages/supi-lsp/__tests__/unit/recovery-coordinator.test.ts`
- `packages/supi-lsp/__tests__/integration/manager.integration.test.ts`
- `packages/supi-lsp/__tests__/integration/service-actions.integration.test.ts`
- `packages/supi-lsp/__tests__/integration/service-actions-workspace.integration.test.ts`

## Change
- Add the shared-runtime dependency in `packages/supi-lsp/package.json`, then run `pnpm install` before editing TypeScript files.
- Start with failing subsystem tests for routing, diagnostics ownership, recovery orchestration, and provider adaptation.
- Introduce the new manager submodules so `manager.ts` becomes a thin orchestrator/facade instead of the single home for startup, routing, diagnostics, recovery, and capability aggregation.
- Implement `src/provider/lsp-semantic-provider.ts` as the shared-runtime semantic-provider adapter.
- Update `src/session/service-registry.ts`, `src/session/lsp-state.ts`, and `src/handlers/session-lifecycle.ts` to publish shared-runtime-compatible session state while preserving current LSP startup and branch-activation behavior.
- Keep `src/api.ts` and `src/index.ts` stable for consumers; this phase may add shared-runtime-backed exports but must not silently remove current LSP API entrypoints.

## Verification
TDD required.

Run in order:
- `pnpm install`
- `pnpm exec vitest run packages/supi-lsp/__tests__/unit/semantic-provider.test.ts packages/supi-lsp/__tests__/unit/client-pool.test.ts packages/supi-lsp/__tests__/unit/workspace-router.test.ts packages/supi-lsp/__tests__/unit/diagnostic-store.test.ts packages/supi-lsp/__tests__/unit/recovery-coordinator.test.ts`
- `pnpm exec vitest run packages/supi-lsp/__tests__/unit/client-pull-diagnostics.test.ts packages/supi-lsp/__tests__/unit/service-registry.test.ts packages/supi-lsp/__tests__/unit/transport.test.ts`
- `pnpm exec vitest run packages/supi-lsp/__tests__/integration/manager.integration.test.ts packages/supi-lsp/__tests__/integration/service-actions.integration.test.ts packages/supi-lsp/__tests__/integration/service-actions-workspace.integration.test.ts`
- `pnpm exec tsc -b packages/supi-lsp/tsconfig.json packages/supi-lsp/__tests__/tsconfig.json`
- `pnpm exec biome check packages/supi-lsp`

Expected result: the new subsystem tests fail first, then pass while the focused LSP regression suites stay green.
