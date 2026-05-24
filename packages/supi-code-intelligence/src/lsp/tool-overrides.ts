// LSP-aware tool overrides — augments write/edit results with inline diagnostics.

import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  EditToolInput,
  ExtensionAPI,
  ExtensionContext,
  WriteToolInput,
} from "@earendil-works/pi-coding-agent";
import { createEditTool, createWriteTool } from "@earendil-works/pi-coding-agent";
import { clearTsconfigCache, getSessionLspService } from "@mrclrchtr/supi-lsp/api";
import type { CodeIntelLspRuntimeState } from "./runtime-state.ts";

/**
 * Register LSP-aware tool overrides that add inline diagnostics
 * after write and edit operations.
 */
export function registerLspToolOverrides(pi: ExtensionAPI, state: CodeIntelLspRuntimeState): void {
  const writeMeta = createWriteTool(process.cwd());
  const editMeta = createEditTool(process.cwd());

  pi.registerTool({
    ...writeMeta,
    // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
    async execute(
      toolCallId: string,
      params: WriteToolInput,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback | undefined,
      ctx: ExtensionContext,
    ) {
      const originalWrite = createWriteTool(ctx.cwd);
      const result = await originalWrite.execute(toolCallId, params, signal, onUpdate);
      if (!state.lspActive) return result;
      return syncAndAugment(state, ctx.cwd, params.path, result);
    },
  });

  pi.registerTool({
    ...editMeta,
    // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
    async execute(
      toolCallId: string,
      params: EditToolInput,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback | undefined,
      ctx: ExtensionContext,
    ) {
      const originalEdit = createEditTool(ctx.cwd);
      const result = await originalEdit.execute(toolCallId, params, signal, onUpdate);
      if (!state.lspActive) return result;
      return syncAndAugment(state, ctx.cwd, params.path, result);
    },
  });

  // Register tool_result handler to detect workspace changes and trigger soft recovery
  pi.on("tool_result", async (event, ctx) => {
    if (!state.lspActive || !state.controller?.manager) return;

    const manager = state.controller.manager;
    const cwd = ctx.cwd;

    // Check if the tool result is from write or edit
    if (event.toolName === "write" || event.toolName === "edit") {
      const input = event.input as { path?: string };
      if (input.path) {
        const resolvedPath = input.path.startsWith("/")
          ? input.path
          : `${cwd}/${input.path.replace(/^@/, "")}`;

        // Clear tsconfig scope cache so the next lookup reflects the file change
        clearTsconfigCache();

        // Notify the manager about workspace changes (new/modified files)
        manager.clearAllPullResultIds();
        manager.notifyWorkspaceFileChanges([
          {
            uri: `file://${resolvedPath}`,
            type: 3, // FileChangeType.Changed
          },
        ]);
      }
    }
  });
}

async function syncAndAugment(
  state: CodeIntelLspRuntimeState,
  cwd: string,
  filePath: string,
  result: AgentToolResult<Record<string, unknown>>,
): Promise<AgentToolResult<Record<string, unknown>>> {
  if (!state.controller?.manager) return result;

  const lspState = getSessionLspService(cwd);
  if (lspState.kind !== "ready") return result;

  const relPath = filePath.replace(/^@/, "");

  // Sync the changed file through LSP to get fresh diagnostics
  const freshDiags = await lspState.service.fileDiagnostics(relPath, state.inlineSeverity);

  if (freshDiags && freshDiags.length > 0) {
    result.content.push({
      type: "text" as const,
      text: `\n**LSP diagnostics for ${filePath}:** ${freshDiags.length} issue(s)`,
    });
  }

  return result;
}
