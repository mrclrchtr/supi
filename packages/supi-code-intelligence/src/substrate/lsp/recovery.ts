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
import { clearTsconfigCache } from "@mrclrchtr/supi-lsp/api";
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

      // Invalidate tsconfig cache when config files change
      const ext = nodePath.extname(resolved).toLowerCase();
      if (ext === ".json" || ext === ".jsonc") {
        clearTsconfigCache();
      }

      runtime.noteWorkspaceChanges([{ uri: filePathToUri(resolved), type: 2 }]);
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

function filePathToUri(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return `file://${normalized.startsWith("/") ? "" : "/"}${normalized}`;
}

/** Extract changed file paths from a code_refactor_apply tool result. */
function getRefactorApplyPaths(event: ToolResultEvent): string[] {
  const details = (event as { details?: unknown }).details as
    | { data?: { plan?: { edits?: { edits?: Array<{ file: string }> } } } }
    | undefined;
  const edits = details?.data?.plan?.edits?.edits;
  if (!edits || edits.length === 0) return [];
  return [...new Set(edits.map((edit) => edit.file))];
}
