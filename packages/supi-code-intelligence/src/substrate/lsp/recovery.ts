// Workspace recovery handler — tool_result event that recovers LSP state after
// file-mutating tool calls.
//
// Notifies the workspace LSP runtime about file changes so diagnostics stay fresh
// for explicit code_health and semantic tool queries.

import * as nodePath from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import { fileToUri } from "@mrclrchtr/supi-core/path";
import {
  invalidateTsconfigCacheForConfig,
  invalidateTsconfigCacheForConfigDir,
  isProjectConfigFileName,
} from "@mrclrchtr/supi-lsp/api";
import type { LspAdapterState } from "./state.ts";

/** Tool names whose successful results should trigger workspace change notifications. */
const MUTATING_TOOL_NAMES = new Set(["write", "edit", "code_refactor_apply"]);

export function registerWorkspaceRecoveryHandler(pi: ExtensionAPI, state: LspAdapterState): void {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: handler branches per tool name; extracting helpers would add indirection
  pi.on("tool_result", async (event: ToolResultEvent, _ctx: ExtensionContext) => {
    const runtime = state.controller?.workspaceRuntime;
    if (!runtime || event.isError) return;
    if (!MUTATING_TOOL_NAMES.has(event.toolName)) return;

    const filePaths =
      event.toolName === "code_refactor_apply"
        ? getRefactorApplyPaths(event)
        : [getFilePathFromToolResult(event)].filter((p): p is string => p !== null);

    if (filePaths.length === 0) return;

    const cwd = state.controller?.cwd ?? "";
    for (const filePath of filePaths) {
      // Normalize @-prefixed paths (pi's built-in file tool convention)
      const normalized = filePath.startsWith("@") ? filePath.slice(1) : filePath;
      const resolved = nodePath.resolve(cwd, normalized);

      // Invalidate the tsconfig scope cache only when a project config itself
      // changed; other .json/.jsonc writes (package.json and friends) do not
      // affect scope decisions and keep their cached parses.
      if (isProjectConfigFileName(nodePath.basename(resolved))) {
        invalidateTsconfigCacheForConfig(resolved);
        invalidateTsconfigCacheForConfigDir(nodePath.dirname(resolved));
      }

      runtime.noteWorkspaceChanges([{ uri: fileToUri(resolved), type: 2 }]);
    }
  });
}

function getFilePathFromToolResult(event: ToolResultEvent): string | null {
  const input = (event as { input?: Record<string, unknown> }).input;
  if (!input || typeof input !== "object") return null;
  const pathValue = input.path;
  if (typeof pathValue !== "string" || !pathValue) return null;
  return pathValue;
}

/** Extract changed file paths emitted by a successful code_refactor_apply result. */
function getRefactorApplyPaths(event: ToolResultEvent): string[] {
  const details = (event as { details?: unknown }).details as
    | { data?: { changedFiles?: unknown } }
    | undefined;
  const changedFiles = details?.data?.changedFiles;
  if (!Array.isArray(changedFiles)) return [];
  return [
    ...new Set(
      changedFiles.filter((file): file is string => typeof file === "string" && file.length > 0),
    ),
  ];
}
