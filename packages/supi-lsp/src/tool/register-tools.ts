import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSessionLspService } from "../session/service-registry.ts";
import type { LspToolPromptSurfaceMap } from "./guidance.ts";
import { LSP_TOOL_DEFINITION_SPECS } from "./tool-specs.ts";

/** Register the expert LSP toolset. Tools are re-registered on session_start to refresh guidance. */
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
  run: (
    service: NonNullable<ReturnType<typeof getReadyService>>,
    cwd: string,
    params: unknown,
  ) => Promise<string>,
) {
  return async (
    _toolCallId: string,
    params: unknown,
    ...rest: [AbortSignal | undefined, unknown, ExtensionContext]
  ) => {
    const ctx = rest[2];
    const service = getReadyService(ctx.cwd);
    const text = service
      ? await run(service, ctx.cwd, params)
      : describeUnavailableService(ctx.cwd);
    return makeTextResult(text);
  };
}

function makeTextResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details: {},
  };
}
