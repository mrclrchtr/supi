// Tree-sitter tool registration for the umbrella extension adapter.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  getSessionTreeSitterService,
  type TreeSitterService,
} from "@mrclrchtr/supi-tree-sitter/api";
import type { TsToolPromptSurfaceMap } from "./guidance.ts";
import { PARAM_SCHEMAS, TS_TOOL_SPECS } from "./tool-specs.ts";

/** Register the tree_sitter_* tools through the umbrella extension. */
export function registerTsTools(pi: ExtensionAPI, promptSurfaces: TsToolPromptSurfaceMap): void {
  for (const spec of TS_TOOL_SPECS) {
    const surface = promptSurfaces[spec.name];
    pi.registerTool({
      name: spec.name,
      label: spec.label,
      description: surface.description,
      promptSnippet: surface.promptSnippet,
      promptGuidelines: surface.promptGuidelines,
      parameters: PARAM_SCHEMAS[spec.paramSchemaKey],
      execute: createTsToolExecutor(spec.run),
    });
  }
}

function getTsService(cwd: string): { service: TreeSitterService } | { error: string } {
  const state = getSessionTreeSitterService(cwd);
  if (state.kind === "ready") return { service: state.service };
  return {
    error:
      state.kind === "unavailable"
        ? (state as { kind: "unavailable"; reason: string }).reason
        : "Tree-sitter not initialized for this workspace.",
  };
}

function createTsToolExecutor(
  run: (
    service: TreeSitterService,
    file: string,
    params: Record<string, unknown>,
  ) => Promise<string>,
) {
  // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
  return async (
    _toolCallId: string,
    params: Record<string, unknown>,
    _signal: AbortSignal | undefined,
    _onUpdate: unknown,
    ctx: ExtensionContext,
  ) => {
    const maybeService = getTsService(ctx.cwd);
    if ("error" in maybeService) {
      return {
        content: [{ type: "text" as const, text: maybeService.error }],
        details: {},
      };
    }

    if (!params.file || typeof params.file !== "string") {
      return {
        content: [{ type: "text" as const, text: "Validation error: `file` is required." }],
        details: {},
      };
    }

    try {
      const text = await run(maybeService.service, params.file, params);
      return { content: [{ type: "text" as const, text }], details: {} };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        details: {},
      };
    }
  };
}
