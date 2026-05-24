# Task 5: Create handlers/status-command.ts (/lsp-status command)

Extract `registerLspStatusCommand` from `lsp.ts` into `handlers/status-command.ts`.

Contains:
- `/lsp-status` command handler — checks enabled, refreshes servers, toggles overlay

Imports from: `session/lsp-state.ts`, `session/settings-registration.ts`, `ui/ui.ts`

Exports: `registerLspStatusCommand(pi: ExtensionAPI, state: LspRuntimeState): void`
