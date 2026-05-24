# Task 2: Create handlers/session-lifecycle.ts (session_start, session_shutdown, agent_end)

Extract `registerSessionLifecycleHandlers` from `lsp.ts` into `handlers/session-lifecycle.ts`.

Contains three pi event handlers:
- `session_start` — shutdown old manager, clear caches, load settings, create LspManager, scan/start servers, register tools with dynamic guidance, persist active state, update UI
- `session_shutdown` — clear caches, shutdown manager, reset state
- `agent_end` — clear context token, refresh servers, update UI

Imports from: `config/config.ts`, `config/tsconfig-scope.ts`, `config/types.ts`, `session/lsp-state.ts`, `session/scanner.ts`, `session/service-registry.ts`, `session/settings-registration.ts`, `session/tree-persist.ts`, `tool/guidance.ts`, `tool/register-tools.ts`, `ui/ui.ts`, `workspace-change.ts` (for refreshWorkspaceSentinels)

Exports: `registerSessionLifecycleHandlers(pi: ExtensionAPI, state: LspRuntimeState): void`

**Note**: `session_start` calls `refreshWorkspaceSentinels` from `workspace-change.ts`.
