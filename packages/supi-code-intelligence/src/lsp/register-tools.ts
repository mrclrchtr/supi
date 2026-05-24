// LSP tool registration for the umbrella extension adapter.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSessionLspService, type SessionLspService } from "@mrclrchtr/supi-lsp/api";
import type { LspToolPromptSurfaceMap } from "./guidance.ts";
import { LSP_TOOL_DEFINITION_SPECS } from "./tool-specs.ts";

/** Register the expert LSP toolset through the umbrella extension. */
export function registerLspTools(pi: ExtensionAPI, promptSurfaces: LspToolPromptSurfaceMap): void {
  for (const spec of LSP_TOOL_DEFINITION_SPECS) {
    const surface = promptSurfaces[spec.name];
    pi.registerTool({
      name: spec.name,
      label: spec.label,
      description: surface.description,
      promptSnippet: surface.promptSnippet,
      promptGuidelines: surface.promptGuidelines,
      parameters: spec.parameters,
      execute: createToolExecutor(spec.run),
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

function createToolExecutor(
  run: (service: SessionLspService, cwd: string, params: unknown) => Promise<string>,
) {
  return async (
    _toolCallId: string,
    params: unknown,
    _signal: AbortSignal | undefined,
    _onUpdate: unknown,
    ctx: ExtensionContext,
  ) => {
    const service = getReadyService(ctx.cwd);
    const text = service
      ? await run(service, ctx.cwd, params)
      : describeUnavailableService(ctx.cwd);
    return { content: [{ type: "text" as const, text }], details: {} };
  };
}

/** Enable LSP tools in the active tool set. */
export function ensureLspToolsActive(pi: ExtensionAPI): void {
  const activeTools = pi.getActiveTools();
  const missing = LSP_TOOL_DEFINITION_SPECS.map((spec) => spec.name).filter(
    (name) => !activeTools.includes(name),
  );
  if (missing.length === 0) return;
  pi.setActiveTools([...activeTools, ...missing]);
}

/** Remove LSP tools from the active tool set. */
export function removeLspTools(pi: ExtensionAPI): void {
  const activeTools = pi.getActiveTools();
  const nextTools = activeTools.filter(
    (name) => !LSP_TOOL_DEFINITION_SPECS.some((spec) => spec.name === name),
  );
  if (nextTools.length !== activeTools.length) {
    pi.setActiveTools(nextTools);
  }
}
