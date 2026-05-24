# Plan: Extract handlers from supi-lsp lsp.ts

## Goal

Refactor `packages/supi-lsp/src/lsp.ts` (~400 lines, `biome-ignore-all`) into a thin wire-up (~50 lines) by extracting event handler functions and workspace change helpers into focused modules.

## Approach

**Additive-only internal refactor** — move private handler functions and helpers out of `lsp.ts` into new files. Zero behavioral changes, zero API surface changes, zero test changes.

## Files

### New files

| File | Responsibility |
|---|---|
| `src/handlers/session-lifecycle.ts` | `session_start` handler (server init, tool registration, sentinel scan, UI sync), `session_shutdown` handler, `agent_end` handler. Exports `registerSessionLifecycleHandlers(pi, state)`. |
| `src/handlers/diagnostic-injection.ts` | `before_agent_start` handler (two-pass prune/refresh, stale detection, fingerprint check, diagnostic context injection), `context` handler (prune + reorder + restorePromptContent), private `buildDiagnosticResult`. Exports `registerDiagnosticInjectionHandlers(pi, state)`. |
| `src/handlers/workspace-recovery.ts` | `tool_result` handler (workspace recovery from write/edit), private `recoverWorkspaceChangesFromToolResult`. Exports `registerWorkspaceRecoveryHandler(pi, state)`. |
| `src/handlers/status-command.ts` | `/lsp-status` command registration. Exports `registerLspStatusCommand(pi, state)`. |
| `src/workspace-change.ts` | Shared helpers: `markWorkspaceChange`, `softRecoverWorkspaceChanges`, `refreshWorkspaceSentinels`, `shouldInvalidateTsconfigScopeCache`. Used by both `diagnostic-injection.ts` and `workspace-recovery.ts`. |

### Modified file

| File | Change |
|---|---|
| `src/lsp.ts` | Remove all inline handler definitions and private helpers. Replace with calls to the new `register*` functions. Remove `biome-ignore-all` annotation. ~50 lines. |

### Updated doc

| File | Change |
|---|---|
| `CLAUDE.md` | Add `handlers/` and `workspace-change.ts` to source layout. Note that `lsp.ts` is now a thin wire-up. |

### Unchanged

All other files: `client/`, `config/`, `diagnostics/`, `manager/`, `session/`, `tool/`, `ui/`, `api.ts`, `index.ts`, `extension.ts`, all test files.

## Constraints

- Zero behavioral changes
- Zero API surface changes (no new exports in `api.ts` or `index.ts`)
- Zero test changes — handlers were already private to `lsp.ts`, tested indirectly via integration/e2e
- No `biome-ignore` annotations on new files (they'll be well under line limits)
- Follow existing import patterns and code style
