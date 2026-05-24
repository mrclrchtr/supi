# Task 4: Create handlers/workspace-recovery.ts (tool_result handler)

Extract the `tool_result` handler and the private `recoverWorkspaceChangesFromToolResult` function from `lsp.ts` into `handlers/workspace-recovery.ts`.

Contains:
- `tool_result` handler — calls `recoverWorkspaceChangesFromToolResult`, refreshes servers, updates UI
- Private `recoverWorkspaceChangesFromToolResult(state, cwd, event)` — determines if write/edit triggered a workspace change, handles sentinel files (.d.ts, package.json, tsconfig, lockfiles) and source file extensions

Imports from: `config/types.ts` (FileChangeType, FileEvent), `config/tsconfig-scope.ts`, `session/lsp-state.ts`, `diagnostics/workspace-sentinels.ts`, `ui/ui.ts`, `utils.ts`, `workspace-change.ts`

Exports: `registerWorkspaceRecoveryHandler(pi: ExtensionAPI, state: LspRuntimeState): void`
