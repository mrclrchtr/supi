// Workspace recovery handler — tool_result event that recovers LSP state after write/edit.
//
// Notifies the LSP manager about file changes so diagnostics stay fresh.

import * as nodePath from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import { clearTsconfigCache } from "@mrclrchtr/supi-lsp/api";
import type { LspAdapterState } from "./state.ts";

export function registerWorkspaceRecoveryHandler(pi: ExtensionAPI, state: LspAdapterState): void {
  pi.on("tool_result", async (event: ToolResultEvent, _ctx: ExtensionContext) => {
    const manager = state.controller?.manager;
    if (!manager || event.isError) return;

    const filePath = getFilePathFromToolResult(event);
    if (!filePath) return;

    // Normalize @-prefixed paths (pi's built-in file tool convention)
    const normalized = filePath.startsWith("@") ? filePath.slice(1) : filePath;
    const resolved = nodePath.resolve(state.controller?.cwd ?? "", normalized);

    // Invalidate tsconfig cache when config files change
    const ext = nodePath.extname(resolved).toLowerCase();
    if (ext === ".json" || ext === ".jsonc") {
      clearTsconfigCache();
    }

    manager.clearAllPullResultIds();
    manager.notifyWorkspaceFileChanges([{ uri: filePathToUri(resolved), type: 2 }]);

    state.staleSuspected = true;
    state.lastDiagnosticsFingerprint = null;
    state.currentContextToken = null;
    state.lastWorkspaceChangeAt = Date.now();
  });
}

function getFilePathFromToolResult(event: ToolResultEvent): string | null {
  if (event.isError) return null;
  if (event.toolName !== "write" && event.toolName !== "edit") return null;
  const input = (event as { input?: Record<string, unknown> }).input;
  if (!input || typeof input !== "object") return null;
  const pathValue = input.path;
  if (typeof pathValue !== "string" || !pathValue) return null;
  return pathValue;
}

function filePathToUri(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return `file://${normalized.startsWith("/") ? "" : "/"}${normalized}`;
}
