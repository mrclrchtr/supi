// LSP tool registration — registers lsp_* tools using the umbrella's tool-specs.
//
// Tool execution delegates to supi-lsp's service methods through the
// LspRuntimeController's service.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSessionLspService } from "@mrclrchtr/supi-lsp/api";
import { defaultLspToolPromptSurfaces, type LspToolPromptSurfaceMap } from "./guidance.ts";
import { executeLspTool } from "./tool-actions.ts";
import { LSP_TOOL_DEFINITION_SPECS } from "./tool-specs.ts";

/**
 * Register the expert LSP toolset (lsp_*) from the umbrella extension.
 *
 * Tools are re-registered on session_start to refresh guidance.
 */
export function registerLspTools(
  pi: ExtensionAPI,
  promptSurfaces: LspToolPromptSurfaceMap = defaultLspToolPromptSurfaces,
): void {
  for (const spec of LSP_TOOL_DEFINITION_SPECS) {
    const surface = promptSurfaces[spec.name];
    pi.registerTool({
      name: spec.name,
      label: spec.label,
      description: surface.description,
      promptSnippet: surface.promptSnippet,
      promptGuidelines: surface.promptGuidelines,
      parameters: spec.parameters,
      execute: createToolExecutor(spec.name),
    });
  }
}

function getReadyService(cwd: string) {
  const state = getSessionLspService(cwd);
  return state.kind === "ready" ? state.service : null;
}

function describeUnavailableService(cwd: string): string {
  const state = getSessionLspService(cwd);
  switch (state.kind) {
    case "pending":
      return "LSP is still starting for this workspace. Retry in a moment.";
    case "inactive":
      return `LSP is inactive on the current session branch for ${cwd}.`;
    case "disabled":
      return `LSP is disabled for ${cwd}.`;
    case "unavailable":
      return state.reason;
    default:
      return "LSP not initialized. Start a new session first.";
  }
}

function createToolExecutor(toolName: string) {
  return createExecuteWrapper(toolName);
}

function createExecuteWrapper(toolName: string) {
  // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
  return async (
    _toolCallId: string,
    params: unknown,
    _signal: AbortSignal | undefined,
    _onUpdate: unknown,
    ctx: ExtensionContext,
  ) => {
    const service = getReadyService(ctx.cwd);
    if (!service) {
      return {
        content: [{ type: "text" as const, text: describeUnavailableService(ctx.cwd) }],
        details: {},
      };
    }

    const text = await executeLspTool(toolName, service, ctx.cwd, params);
    return { content: [{ type: "text" as const, text }], details: {} };
  };
}
