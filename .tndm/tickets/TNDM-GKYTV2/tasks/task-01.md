# Task 1: Add app/workspace-session scaffolding and a thin composition root for code-intelligence

## Goal
Create a stable app/session boundary so `packages/supi-code-intelligence/src/code-intelligence.ts` stops assembling workspace state ad hoc and becomes a thin composition root over explicit app modules. The new workspace session should coordinate local overview/model-cache/adapter state **around** the shared `@mrclrchtr/supi-code-runtime` broker, not replace it.

## Files
- create `packages/supi-code-intelligence/src/app/create-code-intelligence-app.ts`
- create `packages/supi-code-intelligence/src/app/workspace-manager.ts`
- create `packages/supi-code-intelligence/src/app/workspace-session.ts`
- update `packages/supi-code-intelligence/src/code-intelligence.ts`
- update `packages/supi-code-intelligence/src/extension.ts`
- add `packages/supi-code-intelligence/__tests__/unit/app/workspace-manager.test.ts`
- add `packages/supi-code-intelligence/__tests__/unit/app/overview-injection.test.ts`
- update `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`

## Change
1. **RED**: add `packages/supi-code-intelligence/__tests__/unit/app/workspace-manager.test.ts` proving workspace sessions are created once per `cwd`, keep separate semantic/structural adapter slots, track overview/model-cache state, and are cleaned up on shutdown **without** replacing the shared capability broker.
2. **RED**: add `packages/supi-code-intelligence/__tests__/unit/app/overview-injection.test.ts` proving a fresh session injects the hidden overview once and suppresses reinjection when the branch already contains the `code-intelligence-overview` custom message.
3. Create `packages/supi-code-intelligence/src/app/workspace-session.ts` for the local per-workspace state shape. It should own overview-injection state, model-cache state, and references to semantic/structural adapter state while treating `@mrclrchtr/supi-code-runtime` as the canonical capability broker.
4. Create `packages/supi-code-intelligence/src/app/workspace-manager.ts` for lifecycle ownership of per-cwd workspace sessions.
5. Create `packages/supi-code-intelligence/src/app/create-code-intelligence-app.ts` to build the app object and expose registration hooks used by the extension entrypoint.
6. Update `packages/supi-code-intelligence/src/code-intelligence.ts` to delegate to the new app modules instead of constructing LSP / Tree-sitter state directly in the top-level function.
7. Keep `packages/supi-code-intelligence/src/extension.ts` as the public extension entrypoint and update `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` so it verifies the same public surface still registers after the composition-root rewrite.

## Verification
- **RED then GREEN**: `RTK_DISABLED=1 pnpm vitest run -v packages/supi-code-intelligence/__tests__/unit/app/workspace-manager.test.ts packages/supi-code-intelligence/__tests__/unit/app/overview-injection.test.ts packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`
- **Typecheck**: `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`

## Test strategy
Test-driven. Do not write the app modules before watching the new workspace-manager and overview-injection tests fail for the expected missing-API reasons.
