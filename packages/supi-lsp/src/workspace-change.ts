// Workspace change tracking helpers shared by handlers/session-lifecycle.ts,
// handlers/diagnostic-injection.ts, and handlers/workspace-recovery.ts.

import * as path from "node:path";
import { clearTsconfigCache } from "./config/tsconfig-scope.ts";
import type { FileEvent } from "./config/types.ts";
import { syncWorkspaceSentinelSnapshot } from "./diagnostics/workspace-sentinels.ts";
import type { LspRuntimeState } from "./session/lsp-state.ts";

/** Update the state's workspace-change tracking fields after a file modification. */
export function markWorkspaceChange(state: LspRuntimeState): void {
  state.lastWorkspaceChangeAt = Date.now();
  state.staleSuspected = true;
  state.lastDiagnosticsFingerprint = null;
  state.currentContextToken = null;
}

/** Notify the LSP manager about file changes and reset pull-diagnostic state. */
export function softRecoverWorkspaceChanges(state: LspRuntimeState, changes: FileEvent[]): boolean {
  if (!state.manager || changes.length === 0) return false;

  clearTsconfigCache();
  state.manager.clearAllPullResultIds();
  state.manager.notifyWorkspaceFileChanges(changes);
  markWorkspaceChange(state);
  return true;
}

/** Sync the sentinel-file snapshot and recover from any detected changes. */
export function refreshWorkspaceSentinels(state: LspRuntimeState, cwd: string): boolean {
  const { snapshot, changes } = syncWorkspaceSentinelSnapshot(cwd, state.sentinelSnapshot);
  state.sentinelSnapshot = snapshot;
  return softRecoverWorkspaceChanges(state, changes);
}

/** Check whether a given file path's extension suggests tsconfig-scope invalidation. */
export function shouldInvalidateTsconfigScopeCache(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".json" || ext === ".jsonc";
}
