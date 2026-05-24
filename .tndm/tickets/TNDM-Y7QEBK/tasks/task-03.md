# Task 3: Create handlers/diagnostic-injection.ts (before_agent_start + context)

Extract `registerBehaviorHandlers`'s `before_agent_start` and `context` handlers from `lsp.ts` into `handlers/diagnostic-injection.ts`. Also moves the private `buildDiagnosticResult` function.

Contains two pi event handlers:
- `before_agent_start` — ensure tools active, refresh sentinels, two-pass prune/refresh diagnostics, force resync stale modules, refresh servers, update UI, build diagnostic context, fingerprint check, return BeforeAgentStartEventResult
- `context` — prune + reorder lsp-context messages, restore prompt content

Private helper:
- `buildDiagnosticResult(diagnostics, detailed, severity, token, staleWarning?)` — wraps diagnostic data into BeforeAgentStartEventResult

Imports from: `@mrclrchtr/supi-core/api` (pruneAndReorderContextMessages, restorePromptContent), `session/lsp-state.ts`, `diagnostics/diagnostic-context.ts`, `diagnostics/diagnostic-display.ts`, `diagnostics/stale-diagnostics.ts`, `diagnostics/workspace-sentinels.ts`, `manager/manager-stale-resync.ts`, `manager/manager-types.ts`, `ui/ui.ts`, `workspace-change.ts`

Exports: `registerDiagnosticInjectionHandlers(pi: ExtensionAPI, state: LspRuntimeState): void`
