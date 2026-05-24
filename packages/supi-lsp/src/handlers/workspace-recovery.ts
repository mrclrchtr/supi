// Workspace recovery handler — tool_result event.
//
// Extracted from lsp.ts to keep each orchestration concern in its own module.

import type {
  ExtensionAPI,
  ExtensionContext,
  ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import { clearTsconfigCache } from "../config/tsconfig-scope.ts";
import { FileChangeType, type FileEvent } from "../config/types.ts";
import {
  isWorkspaceRecoveryTrigger,
  syncWorkspaceSentinelSnapshot,
} from "../diagnostics/workspace-sentinels.ts";
import {
  isLspAwareTool,
  type LspRuntimeState,
  refreshProjectServers,
} from "../session/lsp-state.ts";
import { updateLspUi } from "../ui/ui.ts";
import { fileToUri, resolveSessionPath } from "../utils.ts";
import {
  shouldInvalidateTsconfigScopeCache,
  softRecoverWorkspaceChanges,
} from "../workspace-change.ts";

/**
 * Register the tool_result handler that detects workspace changes from
 * write / edit tool results and recovers LSP state accordingly.
 */
export function registerWorkspaceRecoveryHandler(pi: ExtensionAPI, state: LspRuntimeState): void {
  pi.on("tool_result", async (event: ToolResultEvent, ctx: ExtensionContext) => {
    if (!state.manager) return;

    const recoveryTriggered = recoverWorkspaceChangesFromToolResult(state, ctx.cwd, {
      toolName: event.toolName,
      isError: event.isError,
      input: (event as { input?: unknown }).input,
    });

    if (recoveryTriggered || isLspAwareTool(event.toolName)) {
      refreshProjectServers(state);
      updateLspUi(ctx, state.manager, state.inlineSeverity, state.projectServers);
    }
  });
}

/**
 * Determine whether a tool result (write/edit) should trigger workspace recovery.
 *
 * Returns true and recovers when the file is:
 *  - a sentinel file (package.json, tsconfig, lockfile, .d.ts)
 *  - a source file whose extension matches an active language server's file types
 *  - a .json / .jsonc file (tsconfig cache invalidation)
 */
function recoverWorkspaceChangesFromToolResult(
  state: LspRuntimeState,
  cwd: string,
  event: { toolName: string; isError: boolean; input?: unknown },
): boolean {
  if (!state.manager || event.isError) return false;
  if (event.toolName !== "write" && event.toolName !== "edit") return false;
  if (!event.input || typeof event.input !== "object") return false;

  const pathValue = (event.input as { path?: unknown }).path;
  if (typeof pathValue !== "string") return false;

  const resolvedPath = resolveSessionPath(cwd, pathValue);
  if (shouldInvalidateTsconfigScopeCache(resolvedPath)) {
    clearTsconfigCache();
  }
  const fileEvent: FileEvent = { uri: fileToUri(resolvedPath), type: FileChangeType.Changed };

  // Sentinel files (package.json, tsconfig.json, lockfiles, .d.ts)
  if (isWorkspaceRecoveryTrigger(resolvedPath, cwd)) {
    if (resolvedPath.endsWith(".d.ts")) {
      return softRecoverWorkspaceChanges(state, [fileEvent]);
    }

    const { snapshot, changes } = syncWorkspaceSentinelSnapshot(cwd, state.sentinelSnapshot);
    state.sentinelSnapshot = snapshot;
    return softRecoverWorkspaceChanges(state, changes.length > 0 ? changes : [fileEvent]);
  }

  // Source files matching an active language server's file types
  if (state.manager.hasServerForExtension(resolvedPath)) {
    return softRecoverWorkspaceChanges(state, [fileEvent]);
  }

  return false;
}
