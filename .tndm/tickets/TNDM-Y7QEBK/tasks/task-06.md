# Task 6: Rewire lsp.ts to delegate to handler modules

Rewrite `lsp.ts` into a thin wire-up (~50 lines). The `lspExtension` function:

1. Keeps all top-level imports needed for registration calls
2. Calls `registerLspSettings()`
3. Creates runtime state via `createRuntimeState()`
4. Calls `registerLspAwareToolOverrides(pi, ...)` (unchanged — stays in `tool/overrides.ts`)
5. Calls `registerLspTools(pi, defaultLspToolPromptSurfaces)` (unchanged — stays in `tool/register-tools.ts`)
6. Calls the new handler registration functions:
   - `registerSessionLifecycleHandlers(pi, state)` from `handlers/session-lifecycle.ts`
   - `registerDiagnosticInjectionHandlers(pi, state)` from `handlers/diagnostic-injection.ts`
   - `registerWorkspaceRecoveryHandler(pi, state)` from `handlers/workspace-recovery.ts`
   - `registerLspStatusCommand(pi, state)` from `handlers/status-command.ts`
7. Calls `registerTreePersistHandlers(pi, state)` (unchanged)
8. Calls `registerLspMessageRenderer(pi)` (unchanged)

Remove:
- All inline handler functions (registerSessionLifecycleHandlers, registerBehaviorHandlers, registerLspStatusCommand)
- All private helper functions (markWorkspaceChange, softRecoverWorkspaceChanges, refreshWorkspaceSentinels, shouldInvalidateTsconfigScopeCache, recoverWorkspaceChangesFromToolResult, buildDiagnosticResult)
- The `biome-ignore-all lint/nursery/noExcessiveLinesPerFile` annotation
- Stale imports no longer needed

Keep:
- The `lspExtension` export default function
- Imports for `registerLspSettings`, `createRuntimeState`, `registerLspAwareToolOverrides`, `registerLspTools`, `defaultLspToolPromptSurfaces`, `registerTreePersistHandlers`, `registerLspMessageRenderer`
- New imports for the four handler registration functions and from `session/lsp-state.ts`
